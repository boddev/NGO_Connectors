import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
  Timer,
  output,
} from "@azure/functions";
import { fetchReliefWebData } from "../dataSources/reliefweb.js";
import { fetchHdxData } from "../dataSources/hdx.js";
import { fetchIfrcEvents, fetchIfrcAppeals } from "../dataSources/ifrc.js";
import { transformToExternalItem } from "../transform/normalizer.js";
import { generateSummaryItems } from "../summaries/summaryGenerator.js";
import { batchIngest } from "../services/ingestion.js";
import { loadCrawlState, saveCrawlState } from "../state/crawlState.js";
import type { HumanitarianRecord } from "../dataSources/types.js";

const crawlQueueOutput = output.storageQueue({
  queueName: "ngo-humanitarian-crawl-requests",
  connection: "AzureWebJobsStorage",
});
interface FullCrawlQueueMessage {
  crawlId?: string;
  requestedAt?: string;
  requestedBy?: string;
}

function createCrawlId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getQueuedCrawlId(message: unknown): string | null {
  if (typeof message === "string") {
    try {
      return getQueuedCrawlId(JSON.parse(message));
    } catch {
      return null;
    }
  }

  if (typeof message !== "object" || message === null || !("crawlId" in message)) {
    return null;
  }

  const crawlId = (message as FullCrawlQueueMessage).crawlId;
  return typeof crawlId === "string" && crawlId.trim().length > 0 ? crawlId : null;
}

function markCrawlError(error: unknown, context: InvocationContext): void {
  const errorState = loadCrawlState();
  errorState.crawlStatus = "error";
  errorState.activeFullCrawlId = null;
  saveCrawlState(errorState);
  const msg = error instanceof Error ? error.message : String(error);
  context.error(`Full crawl failed: ${msg}`);
}
/**
 * Execute a full crawl: fetch all data sources, normalize, and ingest.
 */
async function executeFullCrawl(
  context: InvocationContext
): Promise<{ succeeded: number; failed: number; total: number }> {
  context.log("Starting full crawl...");
  const allRecords: HumanitarianRecord[] = [];

  // Source 1: ReliefWeb
  context.log("Fetching ReliefWeb crisis reports...");
  try {
    const rwRecords = await fetchReliefWebData();
    context.log(`ReliefWeb: ${rwRecords.length} records fetched`);
    allRecords.push(...rwRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`ReliefWeb fetch failed: ${msg}`);
  }

  // Source 2: HDX
  context.log("Fetching HDX humanitarian datasets...");
  try {
    const hdxRecords = await fetchHdxData();
    context.log(`HDX: ${hdxRecords.length} records fetched`);
    allRecords.push(...hdxRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`HDX fetch failed: ${msg}`);
  }

  // Source 3: IFRC GO Events
  context.log("Fetching IFRC GO emergency events...");
  try {
    const ifrcEvents = await fetchIfrcEvents();
    context.log(`IFRC Events: ${ifrcEvents.length} records fetched`);
    allRecords.push(...ifrcEvents);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`IFRC Events fetch failed: ${msg}`);
  }

  // Source 4: IFRC GO Appeals
  context.log("Fetching IFRC GO humanitarian appeals...");
  try {
    const ifrcAppeals = await fetchIfrcAppeals();
    context.log(`IFRC Appeals: ${ifrcAppeals.length} records fetched`);
    allRecords.push(...ifrcAppeals);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`IFRC Appeals fetch failed: ${msg}`);
  }

  context.log(`Total records to ingest: ${allRecords.length}`);

  // Transform to external items
  const items = allRecords.map(transformToExternalItem);

  // Generate and append summary items
  const summaries = generateSummaryItems(allRecords);
  context.log(`Generated ${summaries.length} summary items`);
  items.push(...summaries);

  // Batch ingest with progress logging
  const result = await batchIngest(items, 20, (completed, total, failed) => {
    if (completed % 1000 === 0) {
      context.log(
        `Progress: ${completed}/${total} ingested, ${failed} failed`
      );
    }
  });

  // Update crawl state
  const state = loadCrawlState();
  state.lastFullCrawl = new Date().toISOString();
  state.crawlStatus = "idle";
  state.activeFullCrawlId = null;
  state.knownItemIds = items.map((i) => i.id);
  state.sources["reliefweb"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter((r) => r.sourceOrganization === "ReliefWeb" || r.datasetName === "ReliefWeb Crisis Reports")
      .length,
    lastChecksum: "",
    enabled: state.sources["reliefweb"]?.enabled ?? true,
  };
  state.sources["hdx"]= {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter(
      (r) => r.datasetName === "Humanitarian Data Exchange (HDX)"
    ).length,
    lastChecksum: "",
    enabled: state.sources["hdx"]?.enabled ?? true,
  };
  state.sources["ifrcEvents"]= {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter(
      (r) => r.datasetName === "IFRC GO Emergency Events"
    ).length,
    lastChecksum: "",
    enabled: state.sources["ifrcEvents"]?.enabled ?? true,
  };
  state.sources["ifrcAppeals"]= {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter(
      (r) => r.datasetName === "IFRC GO Appeals"
    ).length,
    lastChecksum: "",
    enabled: state.sources["ifrcAppeals"]?.enabled ?? true,
  };
  saveCrawlState(state);

  context.log(
    `Full crawl complete: ${result.succeeded} succeeded, ${result.failed} failed`
  );

  return {
    succeeded: result.succeeded,
    failed: result.failed,
    total: items.length,
  };
}

// Timer-triggered full crawl (daily at 2 AM UTC)
async function fullCrawlTimer(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log("Full crawl timer triggered");
  try {
    await executeFullCrawl(context);
  } catch (error: unknown) {
    markCrawlError(error, context);
    throw error;
  }
}

app.timer("fullCrawl", {
  schedule: "0 0 2 * * *",
  handler: fullCrawlTimer,
});
app.storageQueue("fullCrawlQueue", {
  queueName: "ngo-humanitarian-crawl-requests",
  connection: "AzureWebJobsStorage",
  handler: async (message: unknown, context: InvocationContext) => {
    context.log("Full crawl queue trigger started");
    const crawlId = getQueuedCrawlId(message);
    if (!crawlId) {
      context.warn("Skipping stale full crawl queue message without a crawlId");
      return;
    }

    const state = loadCrawlState();
    if (state.activeFullCrawlId !== crawlId) {
      context.warn(
        `Skipping stale full crawl queue message ${crawlId}; active crawl is ${state.activeFullCrawlId ?? "none"}`
      );
      return;
    }

    state.crawlStatus = "running";
    saveCrawlState(state);

    try {
      await executeFullCrawl(context);
    } catch (error: unknown) {
      markCrawlError(error, context);
      throw error;
    }
  },
});

// HTTP-triggered on-demand crawl (for admin dashboard)
async function onDemandCrawl(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log("On-demand crawl triggered via HTTP");

  try {
    const state = loadCrawlState();
    const force = request.query.get("force") === "true";
    if (state.crawlStatus === "running" && !force) {
      return {
        status: 202,
        jsonBody: {
          message: "Full crawl is already running",
        },
      };
    }

    const crawlId = createCrawlId();
    state.crawlStatus = "running";
    state.activeFullCrawlId = crawlId;
    saveCrawlState(state);

    context.extraOutputs.set(crawlQueueOutput, {
      crawlId,
      requestedAt: new Date().toISOString(),
      requestedBy: "onDemandCrawl",
    });

    return {
      status: 202,
      jsonBody: {
        message: "On-demand crawl started",
      },
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`On-demand crawl failed: ${msg}`);
    return {
      status: 500,
      jsonBody: { error: msg },
    };
  }
}

app.http("onDemandCrawl", {
  methods: ["POST"],
  authLevel: "function",
  extraOutputs: [crawlQueueOutput],
  handler: onDemandCrawl,
});







