/**
 * Platform heartbeat client for NGO connectors.
 *
 * Each connector self-registers with the Copilot Connector Hosting Platform
 * on a recurring interval so the platform can monitor its health, list it in
 * the observatory, and (optionally) trigger crawls.
 *
 * This file is identical across all 16 NGO connectors. The only per-connector
 * value (`connectionId`) is imported from the connector's local
 * `config/connection.ts`. Update the canonical copy in `ngo-agriculture` and
 * replicate via `setup/sync-platform-client.ps1`.
 */
import { connectionId, connectionName } from "../config/connection.js";
import { loadCrawlStateWithFallback } from "../state/crawlState.js";

export interface HeartbeatDataSource {
  name: string;
  enabled: boolean;
  itemCount: number;
}

export interface HeartbeatConfig {
  platformUrl: string;
  platformTenantId: string;
  registrySharedSecret?: string;
  connectorId: string;
  hostingType: "azure-functions" | "container-apps";
  endpoints: Record<string, string>;
  version: string;
  dataSources: HeartbeatDataSource[];
}

const PACKAGE_VERSION =
  process.env.npm_package_version || "1.0.0";

/**
 * Read the connector's current crawl state and project it into the
 * platform's `dataSources` heartbeat shape.
 *
 * Falls back to a single placeholder entry when state is unavailable so
 * heartbeats keep flowing during cold starts / state read failures.
 */
async function readDataSources(): Promise<HeartbeatDataSource[]> {
  try {
    const state = await loadCrawlStateWithFallback();
    const entries = Object.entries(state.sources || {});
    if (entries.length === 0) {
      return [{ name: connectionName, enabled: true, itemCount: 0 }];
    }
    return entries.map(([name, info]) => ({
      name,
      enabled: !!info.enabled,
      itemCount: typeof info.itemCount === "number" ? info.itemCount : 0,
    }));
  } catch {
    return [{ name: connectionName, enabled: true, itemCount: 0 }];
  }
}

/**
 * Build a heartbeat config from environment + connector identity.
 *
 * Required env vars:
 *   PLATFORM_URL         — base URL of the platform (e.g. https://platform.azurecontainerapps.io)
 *   PLATFORM_TENANT_ID   — tenant id this connector belongs to in the platform
 *
 * Optional env vars:
 *   CONNECTOR_ID         — overrides the default connectionId from connection.ts
 *   REGISTRY_SHARED_SECRET — if set, sent as X-Registry-Secret header
 *   WEBSITE_HOSTNAME     — Azure-provided public hostname, used to build endpoint URLs
 *   PLATFORM_HOSTING_TYPE — "azure-functions" or "container-apps"; auto-detected when unset
 *
 * Returns null when PLATFORM_URL is unset (heartbeats become a no-op).
 */
export async function buildHeartbeatConfig(): Promise<HeartbeatConfig | null> {
  const platformUrl = process.env.PLATFORM_URL || "";
  if (!platformUrl) return null;

  const platformTenantId = process.env.PLATFORM_TENANT_ID || "internal";
  const connectorId = process.env.CONNECTOR_ID || connectionId;
  const registrySharedSecret = process.env.REGISTRY_SHARED_SECRET || "";

  // Build the connector's own public base URL. On Azure Functions / Container
  // Apps, WEBSITE_HOSTNAME is auto-populated by the runtime.
  const hostname = process.env.WEBSITE_HOSTNAME || "";
  const baseUrl = hostname ? `https://${hostname}` : "";

  // Auto-detect hosting type. CONTAINER_APP_NAME is set on Azure Container Apps.
  const hostingType: "azure-functions" | "container-apps" =
    (process.env.PLATFORM_HOSTING_TYPE as "azure-functions" | "container-apps") ||
    (process.env.CONTAINER_APP_NAME ? "container-apps" : "azure-functions");

  // Map our function routes to the platform's expected endpoint names.
  // Note: the platform expects `fullCrawl`; our route is `onDemandCrawl`.
  const endpoints: Record<string, string> = baseUrl
    ? {
        health: `${baseUrl}/api/health`,
        dashboard: `${baseUrl}/api/dashboard`,
        provision: `${baseUrl}/api/provision`,
        fullCrawl: `${baseUrl}/api/onDemandCrawl`,
      }
    : {};

  const dataSources = await readDataSources();

  return {
    platformUrl,
    platformTenantId,
    registrySharedSecret: registrySharedSecret || undefined,
    connectorId,
    hostingType,
    endpoints,
    version: PACKAGE_VERSION,
    dataSources,
  };
}

/**
 * Send a single heartbeat to the platform registry.
 * Throws on network or non-2xx responses so the caller can log/retry.
 */
export async function sendHeartbeat(config: HeartbeatConfig): Promise<void> {
  const url = `${config.platformUrl.replace(/\/+$/, "")}/api/registry/heartbeat`;

  const body = {
    connectorId: config.connectorId,
    tenantId: config.platformTenantId,
    hostingType: config.hostingType,
    endpoints: config.endpoints,
    version: config.version,
    dataSources: config.dataSources,
    status: "online" as const,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.registrySharedSecret) {
    headers["X-Registry-Secret"] = config.registrySharedSecret;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
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
 * Try to send a heartbeat, swallowing all errors.
 * Heartbeat failures must never affect the connector's primary functions.
 */
export async function trySendHeartbeat(): Promise<void> {
  const config = await buildHeartbeatConfig();
  if (!config) {
    console.warn(
      "[heartbeat] PLATFORM_URL not set — skipping heartbeat (connector is not registered with a platform)"
    );
    return;
  }
  try {
    await sendHeartbeat(config);
    const total = config.dataSources.reduce((s, d) => s + d.itemCount, 0);
    console.log(
      `[heartbeat] Sent for ${config.connectorId} → ${config.platformUrl} (${config.dataSources.length} sources, ${total} items)`
    );
  } catch (err) {
    console.error(
      `[heartbeat] Failed for ${config.connectorId}:`,
      err instanceof Error ? err.message : err
    );
  }
}
