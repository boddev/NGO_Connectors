import { ConnectorStatus, HealthStatus, HostingType } from "../types";

export interface Connector {
  id: string;
  tenantId: string;
  connectionId: string;
  displayName: string;
  hostingType: HostingType;
  status: ConnectorStatus;
  endpoints: {
    provision?: string;
    fullCrawl?: string;
    incrementalCrawl?: string;
    dashboard?: string;
    health?: string;
  };
  dataSources: Array<{
    name: string;
    enabled: boolean;
    lastSync: string | null;
    itemCount: number;
  }>;
  schemaVersion: string;
  crawlSchedule: {
    fullCrawlCron: string;
    incrementalCron: string;
  };
  health: {
    runtime: HealthStatus;
    ingestion: HealthStatus;
    search: HealthStatus;
    lastChecked: string | null;
  };
  lastHeartbeat: string | null;
  createdAt: string;
  updatedAt: string;
}

const VALID_HOSTING: HostingType[] = ["azure-functions", "container-apps"];
const VALID_STATUSES: ConnectorStatus[] = [
  "online",
  "offline",
  "provisioning",
  "error",
];

export interface CreateConnectorInput {
  connectionId: string;
  displayName: string;
  hostingType: HostingType;
  endpoints?: Connector["endpoints"];
  crawlSchedule?: Connector["crawlSchedule"];
}

export function validateCreateConnector(
  body: unknown
):
  | { valid: true; data: CreateConnectorInput }
  | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!b.connectionId || typeof b.connectionId !== "string") {
    return {
      valid: false,
      error: "connectionId is required and must be a string",
    };
  }
  if (!b.displayName || typeof b.displayName !== "string") {
    return {
      valid: false,
      error: "displayName is required and must be a string",
    };
  }
  if (!b.hostingType || !VALID_HOSTING.includes(b.hostingType as HostingType)) {
    return {
      valid: false,
      error: `hostingType must be one of: ${VALID_HOSTING.join(", ")}`,
    };
  }

  return {
    valid: true,
    data: {
      connectionId: b.connectionId as string,
      displayName: b.displayName as string,
      hostingType: b.hostingType as HostingType,
      endpoints: (b.endpoints as Connector["endpoints"]) || {},
      crawlSchedule: (b.crawlSchedule as Connector["crawlSchedule"]) || {
        fullCrawlCron: "0 0 * * 0",
        incrementalCron: "0 */6 * * *",
      },
    },
  };
}

export function validateUpdateConnector(
  body: unknown
):
  | { valid: true; data: Partial<Connector> }
  | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (b.status && !VALID_STATUSES.includes(b.status as ConnectorStatus)) {
    return {
      valid: false,
      error: `status must be one of: ${VALID_STATUSES.join(", ")}`,
    };
  }
  if (
    b.hostingType &&
    !VALID_HOSTING.includes(b.hostingType as HostingType)
  ) {
    return {
      valid: false,
      error: `hostingType must be one of: ${VALID_HOSTING.join(", ")}`,
    };
  }

  return { valid: true, data: b as Partial<Connector> };
}
