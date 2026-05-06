import { Router, Request, Response, NextFunction } from "express";
import {
  discoverNGOConnectors,
  toConnectorModel,
} from "../services/discoveryService";
import { checkRuntimeHealth } from "../services/healthService";

const router = Router();

// GET /api/internal/connectors — Auto-discovered NGO connectors
router.get(
  "/connectors",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const discovered = discoverNGOConnectors();
      const connectors = discovered.map(toConnectorModel);
      res.json({ items: connectors, total: connectors.length });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/internal/connectors/:id/health — Health check for specific NGO connector
router.get(
  "/connectors/:id/health",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discovered = discoverNGOConnectors();
      const connector = discovered.find(
        (d) => d.connectionId === req.params.id
      );

      if (!connector) {
        res.status(404).json({ error: "NGO connector not found" });
        return;
      }

      // NGO connectors run on localhost during dev (port 3000 + offset)
      const model = toConnectorModel(connector);
      const healthEndpoint = model.endpoints
        ? (model.endpoints as Record<string, string>).health
        : undefined;

      if (!healthEndpoint) {
        res.json({
          connectionId: connector.connectionId,
          status: "offline",
          message:
            "No health endpoint configured. Connector may not be running.",
        });
        return;
      }

      const status = await checkRuntimeHealth(healthEndpoint);
      res.json({
        connectionId: connector.connectionId,
        status,
        checkedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/internal/connectors/:id/crawl — Trigger crawl for NGO connector
router.post(
  "/connectors/:id/crawl",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discovered = discoverNGOConnectors();
      const connector = discovered.find(
        (d) => d.connectionId === req.params.id
      );

      if (!connector) {
        res.status(404).json({ error: "NGO connector not found" });
        return;
      }

      // In production, this would trigger the connector's crawl endpoint.
      // For now, return info about the connector for manual crawl.
      res.json({
        connectionId: connector.connectionId,
        displayName: connector.connectionName,
        isBuilt: connector.isBuilt,
        message: connector.isBuilt
          ? "Connector is built. Run its crawl command to trigger ingestion."
          : "Connector is not built. Run 'npm run build' in the connector directory first.",
        path: connector.path,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
