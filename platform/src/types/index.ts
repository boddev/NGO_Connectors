import { Request, Response, NextFunction } from "express";

// ── Auth types ──────────────────────────────────────────────────────────────

export type PlatformRole =
  | "platform-admin"
  | "partner-admin"
  | "tenant-admin"
  | "tenant-operator"
  | "tenant-viewer";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  roles: PlatformRole[];
  tenantId: string;
}

// Augment Express Request so req.user and req.tenantId are typed globally
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenantId?: string;
    }
  }
}

// ── Shared type aliases ─────────────────────────────────────────────────────
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type TenantType = "customer" | "partner" | "internal";
export type TenantStatus = "active" | "suspended" | "deactivated";
export type TenantPlan = "free" | "standard" | "enterprise";
export type HostingType = "azure-functions" | "container-apps";
export type ConnectorStatus = "online" | "offline" | "provisioning" | "error";
export type UploadFormat = "csv" | "json" | "jsonl";
export type UploadStatus =
  | "scanning"
  | "validating"
  | "staged"
  | "ingesting"
  | "ingested"
  | "quarantined"
  | "purged";

export interface ApiError {
  statusCode: number;
  message: string;
  details?: unknown;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HealthSummary {
  // New 3-layer summary
  overall: HealthStatus;
  connectors: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
  activeAlerts: {
    critical: number;
    warning: number;
    info: number;
  };
  lastCheck: string;
  // Legacy fields for backward compatibility
  status: HealthStatus;
  totalConnectors: number;
  online: number;
  offline: number;
  degraded: number;
  checkedAt: string;
}

export interface DiscoveredConnector {
  directoryName: string;
  connectionId: string;
  connectionName: string;
  hasDashboard: boolean;
  isBuilt: boolean;
  path: string;
}

// Express handler with typed params
export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;
