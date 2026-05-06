/**
 * Heartbeat client module for connectors.
 *
 * Import this into any connector to self-register with the
 * Copilot Connector Hosting Platform on a recurring interval.
 *
 * Usage:
 *   import { startHeartbeatLoop } from "@platform/clients/heartbeatClient";
 *   const timer = startHeartbeatLoop({ platformUrl: "http://localhost:4000", ... });
 *   // To stop: clearInterval(timer);
 */

export interface HeartbeatConfig {
  platformUrl: string;
  connectorId: string;
  tenantId: string;
  hostingType: "azure-functions" | "container-apps";
  endpoints: Record<string, string>;
  version: string;
  dataSources: Array<{ name: string; enabled: boolean; itemCount: number }>;
}

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Send a single heartbeat to the platform registry.
 * Throws on network or non-2xx responses so callers can handle retries.
 */
export async function sendHeartbeat(config: HeartbeatConfig): Promise<void> {
  const url = `${config.platformUrl.replace(/\/+$/, "")}/api/registry/heartbeat`;

  const body = {
    connectorId: config.connectorId,
    tenantId: config.tenantId,
    hostingType: config.hostingType,
    endpoints: config.endpoints,
    version: config.version,
    dataSources: config.dataSources,
    status: "online" as const,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Heartbeat failed: ${response.status} ${response.statusText} — ${text}`
    );
  }
}

/**
 * Start a recurring heartbeat loop.
 *
 * Sends a heartbeat immediately, then every `intervalMs` milliseconds
 * (default: 60 000 ms / 1 minute). Failures are logged but do not
 * stop the loop.
 *
 * @returns The interval timer handle — call `clearInterval(handle)` to stop.
 */
export function startHeartbeatLoop(
  config: HeartbeatConfig,
  intervalMs: number = DEFAULT_INTERVAL_MS
): NodeJS.Timeout {
  const doHeartbeat = async () => {
    try {
      await sendHeartbeat(config);
      console.log(`[heartbeat] Sent heartbeat for ${config.connectorId}`);
    } catch (err) {
      console.error(
        `[heartbeat] Failed for ${config.connectorId}:`,
        err instanceof Error ? err.message : err
      );
    }
  };

  // Fire immediately, then on interval
  doHeartbeat();
  return setInterval(doHeartbeat, intervalMs);
}
