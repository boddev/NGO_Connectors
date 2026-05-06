import { Router, Request, Response, NextFunction } from "express";
import { getAllConnectors } from "../services/registryService";
import { checkAllConnectors } from "../services/healthService";
import {
  discoverNGOConnectors,
  toConnectorModel,
} from "../services/discoveryService";
import {
  getActiveAlerts,
  acknowledgeAlert,
  resolveAlert,
} from "../services/alertService";
import { getAuditLog } from "../services/auditService";

const router = Router();

// GET /api/observatory/connectors — All connectors across all tenants + NGO connectors
router.get(
  "/connectors",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Registered connectors from the data store
      const registered = await getAllConnectors();

      // Auto-discovered NGO connectors from filesystem
      const discovered = discoverNGOConnectors();
      const ngoConnectors = discovered.map(toConnectorModel);

      // Merge: registered connectors take precedence over discovered ones
      const registeredIds = new Set(registered.map((c) => c.connectionId));
      const unregisteredNGO = ngoConnectors.filter(
        (c) => !registeredIds.has(c.connectionId as string)
      );

      res.json({
        registered: { items: registered, total: registered.length },
        discovered: { items: unregisteredNGO, total: unregisteredNGO.length },
        totalConnectors: registered.length + unregisteredNGO.length,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/observatory/health — Platform-wide health summary (3-layer)
router.get(
  "/health",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const summary = await checkAllConnectors();
      res.json(summary);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/observatory/alerts — Active alerts
router.get(
  "/alerts",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.query.tenantId as string | undefined;
      const alerts = await getActiveAlerts(tenantId);
      res.json({ alerts, total: alerts.length });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/observatory/alerts/:id/acknowledge — Acknowledge an alert
router.patch(
  "/alerts/:id/acknowledge",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await acknowledgeAlert(req.params.id);
      if (!alert) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json(alert);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/observatory/alerts/:id/resolve — Resolve an alert
router.patch(
  "/alerts/:id/resolve",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alert = await resolveAlert(req.params.id);
      if (!alert) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json(alert);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/observatory/audit — Query audit log (platform admin only)
router.get(
  "/audit",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        tenantId: req.query.tenantId as string | undefined,
        action: req.query.action as string | undefined,
        since: req.query.since as string | undefined,
        limit: req.query.limit
          ? parseInt(req.query.limit as string, 10)
          : undefined,
      };
      const entries = getAuditLog(filters);
      res.json({ entries, total: entries.length });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
