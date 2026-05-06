/**
 * Periodic heartbeat to the Copilot Connector Hosting Platform.
 *
 * Schedule: every 2 minutes, plus once on cold start (runOnStartup).
 * Platform requires <5 minutes between heartbeats to keep status "online".
 *
 * This timer is registered globally; if PLATFORM_URL is unset the
 * heartbeat is skipped with a single warning per invocation.
 */
import { app, InvocationContext, Timer } from "@azure/functions";
import { trySendHeartbeat } from "../services/platformClient.js";

async function heartbeat(
  _timer: Timer,
  _context: InvocationContext
): Promise<void> {
  await trySendHeartbeat();
}

app.timer("heartbeat", {
  schedule: "0 */2 * * * *",
  runOnStartup: true,
  handler: heartbeat,
});
