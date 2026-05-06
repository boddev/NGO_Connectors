import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
  Timer,
  output,
} from "@azure/functions";
import { fetchWorldBankOdaData } from "../dataSources/worldBankOda.js";
import { fetchIatiPublishers, fetchIatiActivities } from "../dataSources/iatiRegistry.js";
import { transformToExternalItem } from "../transform/normalizer.js";
import { generateSummaryItems } from "../summaries/summaryGenerator.js";
import { batchIngest } from "../services/ingestion.js";
import { loadCrawlState, saveCrawlState } from "../state/crawlState.js";
import type { AidFundingRecord } from "../dataSources/types.js";

const crawlQueueOutput = output.storageQueue({
  queueName: "ngo-aidfunding-crawl-requests",
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
  const allRecords: AidFundingRecord[] = [];

  // Source 1: World Bank ODA indicators
  context.log("Fetching World Bank ODA data...");
  try {
    const wbRecords = await fetchWorldBankOdaData();
    context.log(`World Bank ODA: ${wbRecords.length} records fetched`);
    allRecords.push(...wbRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`World Bank ODA fetch failed: ${msg}`);
  }

  // Source 2: IATI Registry publishers
  context.log("Fetching IATI Registry publishers...");
  try {
    const iatiPubRecords = await fetchIatiPublishers();
    context.log(`IATI Publishers: ${iatiPubRecords.length} records fetched`);
    allRecords.push(...iatiPubRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`IATI Publishers fetch failed: ${msg}`);
  }

  // Source 3: IATI Datastore activities (optional, requires API key)
  context.log("Fetching IATI Datastore activities...");
  try {
    const iatiActRecords = await fetchIatiActivities();
    context.log(`IATI Activities: ${iatiActRecords.length} records fetched`);
    allRecords.push(...iatiActRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`IATI Activities fetch failed: ${msg}`);
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
  state.sources["worldBankOda"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter((r) => r.sourceOrganization === "World Bank")
      .length,
    lastChecksum: "",
    enabled: state.sources["worldBankOda"]?.enabled ?? true,
  };
  state.sources["iatiRegistry"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter(
      (r) => r.sourceOrganization === "IATI Registry"
    ).length,
    lastChecksum: "",
    enabled: state.sources["iatiRegistry"]?.enabled ?? true,
  };
  state.sources["iatiDatastore"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter(
      (r) => r.sourceOrganization === "IATI Datastore"
    ).length,
    lastChecksum: "",
    enabled: state.sources["iatiDatastore"]?.enabled ?? true,
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

// Timer-triggered full crawl (weekly, Sunday 2 AM UTC)
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
  schedule: "0 0 2 * * 0",
  handler: fullCrawlTimer,
});
app.storageQueue("fullCrawlQueue", {
  queueName: "ngo-aidfunding-crawl-requests",
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







