import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { settings } from "./config/settings";
import { authMiddleware } from "./middleware/auth";
import { requireRole } from "./middleware/rbac";
import { tenantScope } from "./middleware/tenantScope";
import { errorHandler } from "./middleware/errorHandler";
import tenantRoutes from "./routes/tenants";
import connectorRoutes from "./routes/connectors";
import uploadRoutes from "./routes/uploads";
import observatoryRoutes from "./routes/observatory";
import internalRoutes from "./routes/internal";
import registryRoutes from "./routes/registry";
import observatoryJobRoutes, {
  tenantJobRoutes,
  connectorJobRoutes,
} from "./routes/jobs";
import { startJobWorker } from "./services/jobWorker";
import { discoverNGOConnectors } from "./services/discoveryService";
import { getAllConnectors } from "./services/registryService";
import {
  checkConnectorHealth,
  overallConnectorStatus,
  getFailureCount,
} from "./services/healthService";
import { createAlert, autoResolve } from "./services/alertService";
import { getStore, CONNECTORS } from "./services/cosmosService";
import { Connector } from "./models/connector";

const app = express();

// Security & parsing middleware
// CSP is configured to allow inline scripts/styles because the bundled static
// admin UI uses inline <script> blocks. The UI is admin-only and not exposed
// to untrusted content, so the relaxation is acceptable.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, "..", "public")));

// Health check — no auth required (used by load balancers / container orchestrators)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Auth middleware — everything below requires authentication.
// EXCEPTION: registry/heartbeat is mounted ABOVE authMiddleware so deployed
// connectors can self-register without a user JWT. The route enforces an
// optional shared secret (REGISTRY_SHARED_SECRET) for defense in depth.
app.use("/api/registry", registryRoutes);

app.use(authMiddleware);

// Mount routes
app.use("/api/tenants", tenantRoutes);
app.use("/api/tenants/:id/connectors", tenantScope, connectorRoutes);
app.use("/api/tenants/:id/connectors/:cid", tenantScope, uploadRoutes);
app.use("/api/tenants/:id/jobs", tenantScope, tenantJobRoutes);
app.use("/api/tenants/:id/connectors/:cid/jobs", tenantScope, connectorJobRoutes);
app.use(
  "/api/observatory",
  requireRole("platform-admin", "partner-admin"),
  observatoryRoutes
);
app.use(
  "/api/observatory/jobs",
  requireRole("platform-admin", "partner-admin"),
  observatoryJobRoutes
);
app.use("/api/internal", requireRole("platform-admin"), internalRoutes);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(settings.port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Copilot Connector Hosting Platform                      ║
║  Control Plane API                                       ║
╠══════════════════════════════════════════════════════════╣
║  Port:     ${String(settings.port).padEnd(45)}║
║  Storage:  ${(settings.useLocalFallback ? "Local JSON (./data/)" : "Cosmos DB").padEnd(45)}║
╚══════════════════════════════════════════════════════════╝
  `);

  // Auto-discover NGO connectors on startup
  const discovered = discoverNGOConnectors();
  if (discovered.length > 0) {
    console.log(`[startup] Discovered ${discovered.length} NGO connectors:`);
    for (const c of discovered) {
      const status = c.isBuilt ? "✓ built" : "✗ not built";
      const dashboard = c.hasDashboard ? " + dashboard" : "";
      console.log(`  • ${c.connectionId.padEnd(25)} ${status}${dashboard}`);
    }
  }

  // Start the job worker background loop
  startJobWorker();

  // Background health check loop — polls every 60 seconds
  const HEALTH_CHECK_INTERVAL_MS = 60_000;
  setInterval(async () => {
    try {
      const connectors = await getAllConnectors();
      if (connectors.length === 0) return;

      console.log(`[health-loop] Checking ${connectors.length} registered connector(s)...`);
      const store = getStore();

      for (const connector of connectors) {
        const health = await checkConnectorHealth(connector);
        const overall = overallConnectorStatus(health);
        const newStatus: Connector["status"] =
          overall === "healthy" ? "online" :
          overall === "degraded" ? "online" :
          "offline";

        await store.update<Connector>(CONNECTORS, connector.id, {
          status: newStatus,
          health,
          updatedAt: new Date().toISOString(),
        } as Partial<Connector>, connector.tenantId);

        // Alert logic: escalating failures
        const failures = getFailureCount(connector.id);

        if (health.runtime === "unhealthy" || health.runtime === "degraded") {
          if (failures >= 5) {
            await createAlert({
              tenantId: connector.tenantId,
              connectorId: connector.id,
              severity: "critical",
              type: "runtime-down",
              message: `Connector "${connector.displayName}" has failed ${failures} consecutive health checks`,
            });
          } else if (failures >= 3) {
            await createAlert({
              tenantId: connector.tenantId,
              connectorId: connector.id,
              severity: "warning",
              type: "runtime-down",
              message: `Connector "${connector.displayName}" has failed ${failures} consecutive health checks`,
            });
          }
        } else if (health.runtime === "healthy") {
          await autoResolve(connector.id, "runtime-down");
        }

        // Ingestion alerts
        if (health.ingestion === "unhealthy") {
          await createAlert({
            tenantId: connector.tenantId,
            connectorId: connector.id,
            severity: "warning",
            type: "ingestion-failure",
            message: `Connector "${connector.displayName}" ingestion is unhealthy (>10% item failure rate or crawl overdue)`,
          });
        } else if (health.ingestion === "healthy") {
          await autoResolve(connector.id, "ingestion-failure");
        }

        // Search alerts
        if (health.search === "unhealthy") {
          await createAlert({
            tenantId: connector.tenantId,
            connectorId: connector.id,
            severity: "warning",
            type: "search-unhealthy",
            message: `Connector "${connector.displayName}" Graph connection is unhealthy`,
          });
        } else if (health.search === "healthy") {
          await autoResolve(connector.id, "search-unhealthy");
        }

        console.log(
          `[health-loop] ${connector.id}: runtime=${health.runtime}, ingestion=${health.ingestion}, search=${health.search}, overall=${overall}`
        );
      }
    } catch (err) {
      console.error("[health-loop] Error during health check sweep:", err);
    }
  }, HEALTH_CHECK_INTERVAL_MS);
});

export default app;
