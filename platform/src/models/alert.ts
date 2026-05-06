export type AlertSeverity = "critical" | "warning" | "info";

export type AlertType =
  | "runtime-down"
  | "ingestion-failure"
  | "search-unhealthy"
  | "quota-warning"
  | "upload-quarantined";

export type AlertStatus = "active" | "acknowledged" | "resolved";

export interface Alert {
  id: string;
  tenantId: string;
  connectorId: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
  status: AlertStatus;
  createdAt: string;
  resolvedAt: string | null;
}
