import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { getStore, TENANTS, CONNECTORS, UPLOADS } from "../services/cosmosService";
import {
  Tenant,
  validateCreateTenant,
  validateUpdateTenant,
  getDefaultQuotas,
} from "../models/tenant";
import { Connector } from "../models/connector";
import { Upload } from "../models/upload";
import { tenantScope } from "../middleware/tenantScope";
import { getAuditLog } from "../services/auditService";
import { getSecretStore } from "../services/keyVaultService";

const router = Router();

// POST /api/tenants — Create tenant
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validation = validateCreateTenant(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { data } = validation;
    const now = new Date().toISOString();
    const tenant: Tenant = {
      id: uuid(),
      name: data.name,
      type: data.type,
      status: "active",
      entraAppRegistration: data.entraAppRegistration,
      plan: data.plan || "free",
      quotas: getDefaultQuotas(data.plan || "free"),
      contacts: data.contacts,
      createdAt: now,
      updatedAt: now,
    };

    const store = getStore();
    const created = await store.create<Tenant>(TENANTS, tenant);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants — List all tenants
router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const store = getStore();
    const tenants = await store.getAll<Tenant>(TENANTS);
    res.json({ items: tenants, total: tenants.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id — Get tenant
router.get(
  "/:id",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const tenant = await store.getById<Tenant>(TENANTS, req.params.id);
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      res.json(tenant);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/tenants/:id — Update tenant
router.patch(
  "/:id",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = validateUpdateTenant(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const store = getStore();
      const updates = {
        ...validation.data,
        updatedAt: new Date().toISOString(),
      };
      const updated = await store.update<Tenant>(
        TENANTS,
        req.params.id,
        updates
      );
      if (!updated) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/tenants/:id — Soft-delete (set status = deactivated)
router.delete(
  "/:id",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const updated = await store.update<Tenant>(TENANTS, req.params.id, {
        status: "deactivated",
        updatedAt: new Date().toISOString(),
      });
      if (!updated) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      res.json({ message: "Tenant deactivated", tenant: updated });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/offboard — Full offboarding flow
router.post(
  "/:id/offboard",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const tenant = await store.getById<Tenant>(TENANTS, req.params.id);
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }
      if (tenant.status === "deactivated") {
        res.status(409).json({ error: "Tenant is already deactivated" });
        return;
      }

      const now = new Date().toISOString();
      const gracePeriodEnd = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString();

      // Deactivate the tenant
      await store.update<Tenant>(TENANTS, req.params.id, {
        status: "deactivated",
        updatedAt: now,
      });

      // Set all tenant connectors to offline
      const connectors = await store.getAll<Connector>(
        CONNECTORS,
        req.params.id
      );
      let connectorsOfflined = 0;
      for (const connector of connectors) {
        if (connector.status !== "offline") {
          await store.update<Connector>(
            CONNECTORS,
            connector.id,
            { status: "offline", updatedAt: now },
            connector.tenantId
          );
          connectorsOfflined++;
        }
      }

      console.log(
        `[offboard] Tenant ${req.params.id} ("${tenant.name}") offboarded. ` +
          `${connectorsOfflined} connector(s) set offline. ` +
          `Grace period ends ${gracePeriodEnd}.`
      );

      res.json({
        message: "Tenant offboarded successfully",
        tenantId: req.params.id,
        tenantName: tenant.name,
        status: "deactivated",
        connectorsOfflined,
        gracePeriod: {
          days: 30,
          endsAt: gracePeriodEnd,
          note: "All data will be retained for 30 days. After the grace period, data may be permanently deleted.",
        },
        offboardedAt: now,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tenants/:id/stats — Tenant statistics
router.get(
  "/:id/stats",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const tenant = await store.getById<Tenant>(TENANTS, req.params.id);
      if (!tenant) {
        res.status(404).json({ error: "Tenant not found" });
        return;
      }

      const connectors = await store.getAll<Connector>(
        CONNECTORS,
        req.params.id
      );
      const uploads = await store.getAll<Upload>(UPLOADS, req.params.id);

      // Compute total items indexed across all connector data sources
      let totalItemsIndexed = 0;
      for (const c of connectors) {
        if (c.dataSources) {
          for (const ds of c.dataSources) {
            totalItemsIndexed += ds.itemCount || 0;
          }
        }
      }

      // Count active uploads (scanning, validating, staged, ingesting)
      const activeStatuses = ["scanning", "validating", "staged", "ingesting"];
      const activeUploads = uploads.filter((u) =>
        activeStatuses.includes(u.status)
      ).length;

      // Find most recent activity across connectors and uploads
      const timestamps: string[] = [tenant.updatedAt];
      for (const c of connectors) {
        if (c.updatedAt) timestamps.push(c.updatedAt);
        if (c.lastHeartbeat) timestamps.push(c.lastHeartbeat);
      }
      for (const u of uploads) {
        if (u.uploadedAt) timestamps.push(u.uploadedAt);
        if (u.ingestedAt) timestamps.push(u.ingestedAt);
      }
      const lastActivity = timestamps.sort().reverse()[0] || tenant.updatedAt;

      res.json({
        tenantId: req.params.id,
        connectorCount: connectors.length,
        connectorsByStatus: {
          online: connectors.filter((c) => c.status === "online").length,
          offline: connectors.filter((c) => c.status === "offline").length,
          provisioning: connectors.filter((c) => c.status === "provisioning")
            .length,
          error: connectors.filter((c) => c.status === "error").length,
        },
        totalItemsIndexed,
        activeUploads,
        totalUploads: uploads.length,
        lastActivity,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── Secret management routes ────────────────────────────────────────────────

// POST /api/tenants/:id/secrets — Store a secret
router.post(
  "/:id/secrets",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, value } = req.body;
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name is required and must be a string" });
        return;
      }
      if (!value || typeof value !== "string") {
        res.status(400).json({ error: "value is required and must be a string" });
        return;
      }

      const secrets = getSecretStore();
      await secrets.storeSecret(req.params.id, name, value);
      res.status(201).json({ message: "Secret stored", name });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tenants/:id/secrets — List secret names (no values)
router.get(
  "/:id/secrets",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secrets = getSecretStore();
      const names = await secrets.listSecrets(req.params.id);
      res.json({ items: names, total: names.length });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/tenants/:id/secrets/:name — Delete a secret
router.delete(
  "/:id/secrets/:name",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const secrets = getSecretStore();
      const deleted = await secrets.deleteSecret(req.params.id, req.params.name);
      if (!deleted) {
        res.status(404).json({ error: "Secret not found" });
        return;
      }
      res.json({ message: "Secret deleted", name: req.params.name });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tenants/:id/audit — Query audit log for a specific tenant
router.get(
  "/:id/audit",
  tenantScope,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters = {
        tenantId: req.params.id,
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
