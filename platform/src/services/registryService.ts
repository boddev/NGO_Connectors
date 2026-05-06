import { Connector } from "../models/connector";
import { getStore, CONNECTORS } from "./cosmosService";

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function registerConnector(
  connector: Connector
): Promise<Connector> {
  const store = getStore();
  return store.upsert<Connector>(CONNECTORS, connector);
}

export async function heartbeat(
  connectorId: string,
  tenantId: string,
  endpoints?: Connector["endpoints"]
): Promise<Connector | null> {
  const store = getStore();
  const updates: Partial<Connector> = {
    lastHeartbeat: new Date().toISOString(),
    status: "online",
    updatedAt: new Date().toISOString(),
  };
  if (endpoints) {
    updates.endpoints = endpoints;
  }
  return store.update<Connector>(CONNECTORS, connectorId, updates, tenantId);
}

export async function getAllConnectors(): Promise<Connector[]> {
  const store = getStore();
  return store.getAll<Connector>(CONNECTORS);
}

export async function getOnlineConnectors(): Promise<Connector[]> {
  const all = await getAllConnectors();
  const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;
  return all.filter((c) => {
    if (!c.lastHeartbeat) return false;
    return new Date(c.lastHeartbeat).getTime() > cutoff;
  });
}

export async function getOfflineConnectors(): Promise<Connector[]> {
  const all = await getAllConnectors();
  const cutoff = Date.now() - HEARTBEAT_TIMEOUT_MS;
  return all.filter((c) => {
    if (!c.lastHeartbeat) return true;
    return new Date(c.lastHeartbeat).getTime() <= cutoff;
  });
}
