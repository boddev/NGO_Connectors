import { app, Timer, InvocationContext } from "@azure/functions";
import { fetchReliefWebData } from "../dataSources/reliefweb.js";
import { fetchHdxData } from "../dataSources/hdx.js";
import { fetchIfrcEvents, fetchIfrcAppeals } from "../dataSources/ifrc.js";
import { transformToExternalItem } from "../transform/normalizer.js";
import { batchIngest } from "../services/ingestion.js";
import { loadCrawlState, saveCrawlState } from "../state/crawlState.js";
import type { HumanitarianRecord } from "../dataSources/types.js";

/**
 * Incremental crawl: fetch data and ingest only records that are new or changed.
 * Uses the crawl state to compare against previously known items.
 *
 * Runs every 6 hours for near-real-time crisis awareness.
 * The Graph API handles idempotent upserts, so re-ingesting unchanged items is safe.
 */
async function incrementalCrawl(
  timer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log("Incremental crawl triggered");

  const state = loadCrawlState();
  const knownIds = new Set(state.knownItemIds);
  const allRecords: HumanitarianRecord[] = [];

  // Fetch current data from all API sources
  try {
    const rwRecords = await fetchReliefWebData(200);
    allRecords.push(...rwRecords);
  } catch (error: unknown) {
    context.error(
      `ReliefWeb incremental fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const hdxRecords = await fetchHdxData(100);
    allRecords.push(...hdxRecords);
  } catch (error: unknown) {
    context.error(
      `HDX incremental fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const ifrcEvents = await fetchIfrcEvents(100);
    allRecords.push(...ifrcEvents);
  } catch (error: unknown) {
    context.error(
      `IFRC Events incremental fetch failed: ${error instanceof Error ? error.message : error}`
    );
  }

  try {
    const ifrcAppeals = await fetchIfrcAppeals(100);
    allRecords.push(...ifrcAppeals);
  } catch (error: unknown) {
    context.error(
      `IFRC Appeals incremental fetch failed: ${error instanceof Error ? error.message : error}`
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
  schedule: "0 0 */6 * * *", // Every 6 hours
  handler: incrementalCrawl,
});
