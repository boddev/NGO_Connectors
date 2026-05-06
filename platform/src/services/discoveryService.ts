import fs from "fs";
import path from "path";
import { DiscoveredConnector } from "../types";
import { settings } from "../config/settings";

/**
 * Auto-discover NGO connectors from the filesystem.
 * Scans ngo-* directories under NGO_CONNECTORS_PATH for connection config.
 */
export function discoverNGOConnectors(): DiscoveredConnector[] {
  const basePath = settings.ngoConnectorsPath;
  const discovered: DiscoveredConnector[] = [];

  if (!fs.existsSync(basePath)) {
    console.warn(
      `[discovery] NGO connectors path not found: ${basePath}`
    );
    return discovered;
  }

  const entries = fs.readdirSync(basePath, { withFileTypes: true });
  const ngoDirs = entries.filter(
    (e) => e.isDirectory() && e.name.startsWith("ngo-")
  );

  for (const dir of ngoDirs) {
    const dirPath = path.join(basePath, dir.name);
    const connectionFile = path.join(dirPath, "src", "config", "connection.ts");

    if (!fs.existsSync(connectionFile)) {
      continue;
    }

    try {
      const content = fs.readFileSync(connectionFile, "utf-8");

      // Extract connectionId and connectionName from TypeScript source
      const idMatch = content.match(
        /export\s+const\s+connectionId\s*=\s*["']([^"']+)["']/
      );
      const nameMatch = content.match(
        /export\s+const\s+connectionName\s*=\s*["']([^"']+)["']/
      );

      if (!idMatch) {
        console.warn(
          `[discovery] Could not extract connectionId from ${connectionFile}`
        );
        continue;
      }

      const hasDashboard = fs.existsSync(
        path.join(dirPath, "public", "dashboard.html")
      );
      const isBuilt = fs.existsSync(path.join(dirPath, "dist"));

      discovered.push({
        directoryName: dir.name,
        connectionId: idMatch[1],
        connectionName: nameMatch ? nameMatch[1] : dir.name,
        hasDashboard,
        isBuilt,
        path: dirPath,
      });
    } catch (err) {
      console.warn(
        `[discovery] Error reading ${connectionFile}: ${err}`
      );
    }
  }

  console.log(
    `[discovery] Found ${discovered.length} NGO connector(s)`
  );
  return discovered;
}

/**
 * Convert a discovered connector into a Connector model shape (status: offline).
 */
export function toConnectorModel(
  d: DiscoveredConnector
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: d.connectionId,
    tenantId: "ngo-internal",
    connectionId: d.connectionId,
    displayName: d.connectionName,
    hostingType: "azure-functions",
    status: "offline",
    endpoints: {
      dashboard: d.hasDashboard
        ? `file:///${d.path.replace(/\\/g, "/")}/public/dashboard.html`
        : undefined,
    },
    dataSources: [],
    schemaVersion: "1.0",
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
    lastHeartbeat: null,
    isBuilt: d.isBuilt,
    directoryName: d.directoryName,
    path: d.path,
    createdAt: now,
    updatedAt: now,
  };
}
