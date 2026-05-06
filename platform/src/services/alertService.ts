import { v4 as uuidv4 } from "uuid";
import { Alert, AlertSeverity, AlertType, AlertStatus } from "../models/alert";
import { getStore } from "./cosmosService";

export const ALERTS = "alerts";

export interface CreateAlertInput {
  tenantId: string;
  connectorId: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const store = getStore();

  // Avoid duplicate active alerts for the same connector + type
  const existing = await getActiveAlerts();
  const duplicate = existing.find(
    (a) =>
      a.connectorId === input.connectorId &&
      a.type === input.type &&
      a.status !== "resolved"
  );
  if (duplicate) {
    // Escalate severity if needed
    if (
      input.severity === "critical" &&
      duplicate.severity !== "critical"
    ) {
      const updated = await store.update<Alert>(
        ALERTS,
        duplicate.id,
        { severity: "critical", message: input.message },
        duplicate.tenantId
      );
      return updated!;
    }
    return duplicate;
  }

  const alert: Alert = {
    id: uuidv4(),
    tenantId: input.tenantId,
    connectorId: input.connectorId,
    severity: input.severity,
    type: input.type,
    message: input.message,
    status: "active",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  return store.create<Alert>(ALERTS, alert);
}

export async function getActiveAlerts(tenantId?: string): Promise<Alert[]> {
  const store = getStore();
  const all = await store.getAll<Alert>(ALERTS, tenantId);
  return all.filter((a) => a.status !== "resolved");
}

export async function getAllAlerts(tenantId?: string): Promise<Alert[]> {
  const store = getStore();
  return store.getAll<Alert>(ALERTS, tenantId);
}

export async function acknowledgeAlert(id: string): Promise<Alert | null> {
  const store = getStore();
  const alert = await store.getById<Alert>(ALERTS, id);
  if (!alert) return null;
  if (alert.status === "resolved") return alert;

  return store.update<Alert>(
    ALERTS,
    id,
    { status: "acknowledged" as AlertStatus },
    alert.tenantId
  );
}

export async function resolveAlert(id: string): Promise<Alert | null> {
  const store = getStore();
  const alert = await store.getById<Alert>(ALERTS, id);
  if (!alert) return null;
  if (alert.status === "resolved") return alert;

  return store.update<Alert>(
    ALERTS,
    id,
    {
      status: "resolved" as AlertStatus,
      resolvedAt: new Date().toISOString(),
    },
    alert.tenantId
  );
}

export async function autoResolve(
  connectorId: string,
  type: AlertType
): Promise<number> {
  const active = await getActiveAlerts();
  const matching = active.filter(
    (a) => a.connectorId === connectorId && a.type === type
  );

  let resolved = 0;
  for (const alert of matching) {
    await resolveAlert(alert.id);
    resolved++;
  }

  if (resolved > 0) {
    console.log(
      `[alerts] Auto-resolved ${resolved} "${type}" alert(s) for ${connectorId}`
    );
  }
  return resolved;
}
