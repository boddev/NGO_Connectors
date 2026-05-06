import type { ExternalItemPayload } from "../dataSources/types.js";
import { putItem } from "./graphService.js";

/**
 * Batch-ingest items with concurrency control using a semaphore pattern.
 * Limits concurrent Graph API calls to stay within the 25 concurrent ops limit.
 *
 * @param items - Items to ingest
 * @param concurrency - Max concurrent Graph API calls (default: 4)
 * @param onProgress - Optional callback for progress tracking
 */
export async function batchIngest(
  items: ExternalItemPayload[],
  concurrency = 4,
  onProgress?: (completed: number, total: number, failed: number) => void
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  let completed = 0;
  let failed = 0;
  const errors: string[] = [];
  let activeCount = 0;

  const results = items.map(
    (item) =>
      new Promise<void>(async (resolve) => {
        // Simple semaphore: wait until slot is available
        while (activeCount >= concurrency) {
          await new Promise((r) => setTimeout(r, 100));
        }
        activeCount++;

        try {
          await putItem(item);
          completed++;
        } catch (error: unknown) {
          failed++;
          const msg =
            error instanceof Error ? error.message : String(error);
          errors.push(`Item ${item.id}: ${msg}`);
          console.error(`Failed to ingest item ${item.id}: ${msg}`);
        } finally {
          activeCount--;
          onProgress?.(completed, items.length, failed);
        }

        resolve();
      })
  );

  await Promise.all(results);

  return { succeeded: completed, failed, errors };
}
