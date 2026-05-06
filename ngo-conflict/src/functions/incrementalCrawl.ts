import { app, Timer, InvocationContext } from "@azure/functions";
import { fetchWorldBankData } from "../dataSources/worldBank.js";
import { transformToExternalItem } from "../transform/normalizer.js";
import { batchIngest } from "../services/ingestion.js";
import { loadCrawlState, saveCrawlState } from "../state/crawlState.js";
import type { ConflictRecord } from "../dataSources/types.js";

/**
 * Incremental crawl: fetch API data and ingest only records that are new or changed.
 * Uses the crawl state to compare against previously known items.
 *
 * Note: CSV sources (ACLED, UCDP, UNODC) are not included in incremental crawls
 * since they require manual file updates. Only World Bank API is re-fetched.
 * The Graph API handles idempotent upserts, so re-ingesting unchanged items is safe.
 */
async function incrementalCrawl(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log("Incremental crawl triggered");

  const state = loadCrawlState();
  const knownIds = new Set(state.knownItemIds);
  const allRecords: ConflictRecord[] = [];

  // Fetch current data from API sources
  try {
    const wbRecords = await fetchWorldBankData();
    allRecords.push(...wbRecords);
  } catch (error: unknown) {
    context.error(
      `World Bank incremental fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  // Transform all records
  const allItems = allRecords.map(transformToExternalItem);
  const currentIds = new Set(allItems.map((i) => i.id));

  // Find new/updated items (not in known set)
  const newItems = allItems.filter((item) => !knownIds.has(item.id));

  context.log(
    `Incremental: ${allItems.length} total, ${newItems.length} new/updated`
  );

  if (newItems.length > 0) {
    const result = await batchIngest(newItems, 4);
    context.log(
      `Incremental ingest: ${result.succeeded} succeeded, ${result.failed} failed`
    );
  }

  // Update state with current item IDs (merge with existing CSV-based IDs)
  state.lastIncrementalCrawl = new Date().toISOString();
  const mergedIds = new Set([...state.knownItemIds, ...currentIds]);
  state.knownItemIds = [...mergedIds];
  saveCrawlState(state);

  context.log("Incremental crawl complete");
}

app.timer("incrementalCrawl", {
  schedule: "0 0 6 * * *", // Daily at 6 AM UTC
  handler: incrementalCrawl,
});
