import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { Connector } from "../models/connector";
import {
  registerConnector,
  heartbeat,
  getAllConnectors,
} from "../services/registryService";
import { ConnectorStatus, HostingType } from "../types";

const router = Router();

interface HeartbeatBody {
  connectorId: string;
  tenantId: string;
  hostingType: HostingType;
  endpoints: {
    provision?: string;
    fullCrawl?: string;
    dashboard?: string;
    health?: string;
  };
  version: string;
  dataSources: Array<{ name: string; enabled: boolean; itemCount: number }>;
  status: "online" | "error";
}

const VALID_HOSTING: HostingType[] = ["azure-functions", "container-apps"];
const VALID_STATUSES: ConnectorStatus[] = ["online", "error"];

function validateHeartbeat(
  body: unknown
):
  | { valid: true; data: HeartbeatBody }
  | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!b.connectorId || typeof b.connectorId !== "string") {
    return { valid: false, error: "connectorId is required and must be a string" };
  }
  if (!b.tenantId || typeof b.tenantId !== "string") {
    return { valid: false, error: "tenantId is required and must be a string" };
  }
  // Accept "container-app" (used by deploy scripts) as an alias for "container-apps"
  if (b.hostingType === "container-app") {
    b.hostingType = "container-apps";
  }
  if (!b.hostingType || !VALID_HOSTING.includes(b.hostingType as HostingType)) {
    return { valid: false, error: `hostingType must be one of: ${VALID_HOSTING.join(", ")}` };
  }
  if (!b.endpoints || typeof b.endpoints !== "object") {
    return { valid: false, error: "endpoints is required and must be an object" };
  }
  if (!b.version || typeof b.version !== "string") {
    return { valid: false, error: "version is required and must be a string" };
  }
  if (!Array.isArray(b.dataSources)) {
    return { valid: false, error: "dataSources is required and must be an array" };
  }
  if (!b.status || !VALID_STATUSES.includes(b.status as ConnectorStatus)) {
    return { valid: false, error: `status must be one of: ${VALID_STATUSES.join(", ")}` };
  }

  return { valid: true, data: b as unknown as HeartbeatBody };
}

// POST /api/registry/heartbeat — Connector self-registration / heartbeat
router.post(
  "/heartbeat",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Optional shared-secret check. When REGISTRY_SHARED_SECRET is set on
      // the platform, callers must present it via X-Registry-Secret. When
      // unset, the endpoint is open (suitable for trusted networks / dev).
      const expectedSecret = process.env.REGISTRY_SHARED_SECRET || "";
      if (expectedSecret) {
        const provided = req.header("x-registry-secret") || "";
        if (provided !== expectedSecret) {
          res.status(401).json({ error: "Invalid or missing X-Registry-Secret" });
          return;
        }
      }

      const result = validateHeartbeat(req.body);
      if (!result.valid) {
        res.status(400).json({ error: result.error });
        return;
      }

      const data = result.data;
      const now = new Date().toISOString();

      // Try to update an existing connector via heartbeat first
      const existing = await heartbeat(
        data.connectorId,
        data.tenantId,
        data.endpoints
      );

      if (existing) {
        // Update additional fields that the basic heartbeat doesn't cover
        const allConnectors = await getAllConnectors();
        const connector = allConnectors.find((c) => c.id === data.connectorId);

        if (connector) {
          // Merge updated fields back via registerConnector (upsert)
          const updated: Connector = {
            ...connector,
            hostingType: data.hostingType,
            status: data.status,
            endpoints: data.endpoints,
            schemaVersion: data.version,
            dataSources: data.dataSources.map((ds) => ({
              ...ds,
              lastSync: null,
            })),
            lastHeartbeat: now,
            updatedAt: now,
          };
          const saved = await registerConnector(updated);
          console.log(`[registry] Heartbeat from ${data.connectorId} (existing)`);
          res.json({ registered: true, connector: saved });
          return;
        }
      }

      // First heartbeat — register as a new connector
      const newConnector: Connector = {
        id: data.connectorId,
        tenantId: data.tenantId,
        connectionId: data.connectorId,
        displayName: data.connectorId,
        hostingType: data.hostingType,
        status: data.status,
        endpoints: data.endpoints,
        dataSources: data.dataSources.map((ds) => ({
          ...ds,
          lastSync: null,
        })),
        schemaVersion: data.version,
        crawlSchedule: {
          fullCrawlCron: "0 0 * * 0",
          incrementalCron: "0 */6 * * *",
        },
        health: {
          runtime: "unknown",
          ingestion: "unknown",
          search: "unknown",
          lastChecked: null,
        },
        lastHeartbeat: now,
        createdAt: now,
        updatedAt: now,
      };

      const saved = await registerConnector(newConnector);
      console.log(`[registry] Heartbeat from ${data.connectorId} (new registration)`);
      res.status(201).json({ registered: true, connector: saved });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
