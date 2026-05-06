import { app, Timer, InvocationContext } from "@azure/functions";
import { fetchUnhcrByOrigin, fetchUnhcrByAsylum } from "../dataSources/unhcr.js";
import { fetchWorldBankMigrationData } from "../dataSources/worldBank.js";
import { transformToExternalItem } from "../transform/normalizer.js";
import { batchIngest } from "../services/ingestion.js";
import { loadCrawlState, saveCrawlState } from "../state/crawlState.js";
import type { RefugeeRecord } from "../dataSources/types.js";

/**
 * Incremental crawl: fetch data and ingest only records that are new or changed.
 * Uses the crawl state to compare against previously known items.
 *
 * Note: For API sources like UNHCR and World Bank that don't support
 * delta queries, we re-fetch and compare item IDs. The Graph API handles
 * idempotent upserts, so re-ingesting unchanged items is safe (if wasteful).
 * A production optimization would compare content hashes.
 */
async function incrementalCrawl(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log("Incremental crawl triggered");

  const state = loadCrawlState();
  const knownIds = new Set(state.knownItemIds);
  const allRecords: RefugeeRecord[] = [];

  // Fetch current data from UNHCR (most recent year only for incremental)
  try {
    const currentYear = new Date().getFullYear();
    const originRecords = await fetchUnhcrByOrigin([currentYear, currentYear - 1]);
    allRecords.push(...originRecords);
  } catch (error: unknown) {
    context.error(
      `UNHCR origin incremental fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const currentYear = new Date().getFullYear();
    const asylumRecords = await fetchUnhcrByAsylum([currentYear, currentYear - 1]);
    allRecords.push(...asylumRecords);
  } catch (error: unknown) {
    context.error(
      `UNHCR asylum incremental fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  // World Bank data updates infrequently; include in incremental crawl
  try {
    const wbRecords = await fetchWorldBankMigrationData();
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

  // Update state with current item IDs
  state.lastIncrementalCrawl = new Date().toISOString();
  state.knownItemIds = [...currentIds];
  saveCrawlState(state);

  context.log("Incremental crawl complete");
}

app.timer("incrementalCrawl", {
  schedule: "0 0 6 * * *", // Daily at 6 AM UTC
  handler: incrementalCrawl,
});
