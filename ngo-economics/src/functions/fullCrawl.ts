import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
  Timer,
  output,
} from "@azure/functions";
import { fetchWorldBankData } from "../dataSources/worldBank.js";
import { fetchOwidData } from "../dataSources/owid.js";
import { fetchUndpHdiData } from "../dataSources/undpHdi.js";
import { transformToExternalItem } from "../transform/normalizer.js";
import { generateSummaryItems } from "../summaries/summaryGenerator.js";
import { batchIngest } from "../services/ingestion.js";
import { loadCrawlState, saveCrawlState } from "../state/crawlState.js";
import type { EconomicsRecord } from "../dataSources/types.js";

const crawlQueueOutput = output.storageQueue({
  queueName: "ngo-economics-crawl-requests",
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
  const allRecords: EconomicsRecord[] = [];

  // Source 1: World Bank
  context.log("Fetching World Bank economic data...");
  try {
    const wbRecords = await fetchWorldBankData();
    context.log(`World Bank: ${wbRecords.length} records fetched`);
    allRecords.push(...wbRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`World Bank fetch failed: ${msg}`);
  }

  // Source 2: Our World in Data
  context.log("Fetching Our World in Data...");
  try {
    const owidRecords = await fetchOwidData();
    context.log(`OWID: ${owidRecords.length} records fetched`);
    allRecords.push(...owidRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`OWID fetch failed: ${msg}`);
  }

  // Source 3: UNDP HDI
  context.log("Fetching UNDP Human Development Index data...");
  try {
    const undpRecords = await fetchUndpHdiData();
    context.log(`UNDP HDI: ${undpRecords.length} records fetched`);
    allRecords.push(...undpRecords);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    context.error(`UNDP HDI fetch failed: ${msg}`);
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
  state.sources["worldBank"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter((r) => r.sourceOrganization === "World Bank")
      .length,
    lastChecksum: "",
    enabled: state.sources["worldBank"]?.enabled ?? true,
  };
  state.sources["owid"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter(
      (r) => r.sourceOrganization === "Our World in Data"
    ).length,
    lastChecksum: "",
    enabled: state.sources["owid"]?.enabled ?? true,
  };
  state.sources["undpHdi"] = {
    lastSync: new Date().toISOString(),
    itemCount: allRecords.filter((r) => r.sourceOrganization === "UNDP")
      .length,
    lastChecksum: "",
    enabled: state.sources["undpHdi"]?.enabled ?? true,
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

// Timer-triggered full crawl (bi-weekly: 1st & 15th at 2 AM UTC)
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
  schedule: "0 0 2 1,15 * *",
  handler: fullCrawlTimer,
});
app.storageQueue("fullCrawlQueue", {
  queueName: "ngo-economics-crawl-requests",
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







