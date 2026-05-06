import { HealthStatus, HealthSummary } from "../types";
import { Connector } from "../models/connector";
import { getAllConnectors } from "./registryService";
import { getActiveAlerts } from "./alertService";

const HEALTH_CHECK_TIMEOUT_MS = 10_000;

// ── Failure tracking ────────────────────────────────────────────────────────

const runtimeFailureCounts = new Map<string, number>();

export function getFailureCount(connectorId: string): number {
  return runtimeFailureCounts.get(connectorId) ?? 0;
}

export function resetFailureCount(connectorId: string): void {
  runtimeFailureCounts.delete(connectorId);
}

// ── Ingestion metrics tracking ──────────────────────────────────────────────

export interface IngestionMetrics {
  itemsSucceeded: number;
  itemsFailed: number;
  throttleCount: number;
  lastCrawlDurationMs: number;
  lastCrawlAt: string;
}

const ingestionMetrics = new Map<string, IngestionMetrics>();

export function reportIngestionMetrics(
  connectorId: string,
  metrics: IngestionMetrics
): void {
  ingestionMetrics.set(connectorId, metrics);
}

export function getIngestionMetrics(
  connectorId: string
): IngestionMetrics | undefined {
  return ingestionMetrics.get(connectorId);
}

// ── Search health tracking ──────────────────────────────────────────────────

const searchHealthReports = new Map<string, HealthStatus>();

export function reportSearchHealth(
  connectorId: string,
  status: HealthStatus
): void {
  searchHealthReports.set(connectorId, status);
}

// ── Layer 1: Runtime Health ─────────────────────────────────────────────────

export async function checkRuntimeHealth(
  endpoint: string,
  connectorId?: string
): Promise<HealthStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      HEALTH_CHECK_TIMEOUT_MS
    );

    const response = await fetch(endpoint, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      if (connectorId) resetFailureCount(connectorId);
      return "healthy";
    }
    if (connectorId) {
      runtimeFailureCounts.set(connectorId, getFailureCount(connectorId) + 1);
    }
    if (response.status >= 500) return "unhealthy";
    return "degraded";
  } catch {
    if (connectorId) {
      runtimeFailureCounts.set(connectorId, getFailureCount(connectorId) + 1);
    }
    return "unhealthy";
  }
}

// ── Layer 2: Ingestion Health ───────────────────────────────────────────────

export function checkIngestionHealth(connector: Connector): HealthStatus {
  const metrics = ingestionMetrics.get(connector.id);
  if (!metrics) return "unknown";

  const totalItems = metrics.itemsSucceeded + metrics.itemsFailed;
  if (totalItems > 0) {
    const failureRate = metrics.itemsFailed / totalItems;
    if (failureRate > 0.1) return "unhealthy";
  }

  // Check if last crawl is overdue (2x the scheduled interval)
  // Parse the incremental cron to estimate interval; default to 6h
  const scheduledIntervalMs = estimateCronIntervalMs(
    connector.crawlSchedule?.incrementalCron
  );
  const lastCrawlTime = new Date(metrics.lastCrawlAt).getTime();
  const overdueThreshold = scheduledIntervalMs * 2;

  if (Date.now() - lastCrawlTime > overdueThreshold) {
    return "degraded";
  }

  return "healthy";
}

function estimateCronIntervalMs(cron?: string): number {
  // Default: 6 hours
  if (!cron) return 6 * 60 * 60 * 1000;

  // Simple heuristic: "0 */N * * *" means every N hours
  const match = cron.match(/^\d+\s+\*\/(\d+)\s+/);
  if (match) {
    return parseInt(match[1], 10) * 60 * 60 * 1000;
  }

  // "0 0 * * 0" (weekly) → 7 days
  if (cron.match(/^\d+\s+\d+\s+\*\s+\*\s+\d+$/)) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  return 6 * 60 * 60 * 1000;
}

// ── Layer 3: Search Health (stub for Graph API) ─────────────────────────────

export function checkSearchHealth(connectorId: string): HealthStatus {
  // In production: GET /external/connections/{id} to verify connection state.
  // For now, return self-reported status or "unknown".
  return searchHealthReports.get(connectorId) ?? "unknown";
}

// ── Combined connector health check ─────────────────────────────────────────

export async function checkConnectorHealth(
  connector: Connector
): Promise<Connector["health"]> {
  const health: Connector["health"] = {
    runtime: "unknown",
    ingestion: "unknown",
    search: "unknown",
    lastChecked: new Date().toISOString(),
  };

  // Layer 1: Runtime
  if (connector.endpoints.health) {
    health.runtime = await checkRuntimeHealth(
      connector.endpoints.health,
      connector.id
    );
  }

  // Layer 2: Ingestion
  health.ingestion = checkIngestionHealth(connector);

  // Layer 3: Search
  health.search = checkSearchHealth(connector.id);

  return health;
}

// ── Overall status for a single connector ───────────────────────────────────

export function overallConnectorStatus(health: Connector["health"]): HealthStatus {
  if (health.runtime === "unhealthy") return "unhealthy";
  if (health.ingestion === "unhealthy") return "unhealthy";
  if (health.search === "unhealthy") return "unhealthy";

  if (
    health.runtime === "degraded" ||
    health.ingestion === "degraded" ||
    health.search === "degraded"
  ) {
    return "degraded";
  }

  if (health.runtime === "healthy") return "healthy";
  return "unknown";
}

// ── Platform-wide health summary ────────────────────────────────────────────

export async function checkAllConnectors(): Promise<HealthSummary> {
  const connectors = await getAllConnectors();
  let healthy = 0;
  let unhealthy = 0;
  let degraded = 0;

  for (const connector of connectors) {
    const health = await checkConnectorHealth(connector);
    const overall = overallConnectorStatus(health);
    if (overall === "healthy") healthy++;
    else if (overall === "degraded") degraded++;
    else unhealthy++;
  }

  // Alert counts
  const activeAlerts = await getActiveAlerts();
  const criticalCount = activeAlerts.filter((a) => a.severity === "critical").length;
  const warningCount = activeAlerts.filter((a) => a.severity === "warning").length;
  const infoCount = activeAlerts.filter((a) => a.severity === "info").length;

  let overallStatus: HealthStatus = "healthy";
  if (unhealthy > 0 && healthy === 0) overallStatus = "unhealthy";
  else if (degraded > 0 || unhealthy > 0) overallStatus = "degraded";

  return {
    overall: overallStatus,
    connectors: {
      total: connectors.length,
      healthy,
      degraded,
      unhealthy,
    },
    activeAlerts: {
      critical: criticalCount,
      warning: warningCount,
      info: infoCount,
    },
    lastCheck: new Date().toISOString(),
    // Legacy fields for backward compatibility
    status: overallStatus,
    totalConnectors: connectors.length,
    online: healthy,
    offline: unhealthy,
    degraded,
    checkedAt: new Date().toISOString(),
  };
}
