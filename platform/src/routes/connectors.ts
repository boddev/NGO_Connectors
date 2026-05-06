import { Router, Request, Response, NextFunction } from "express";
import { v4 as uuid } from "uuid";
import { getStore, CONNECTORS } from "../services/cosmosService";
import {
  Connector,
  validateCreateConnector,
  validateUpdateConnector,
} from "../models/connector";
import { checkConnectorHealth } from "../services/healthService";
import { tenantScope } from "../middleware/tenantScope";
import {
  createDraft,
  validateSchema,
  validateSchemaVersion,
  promoteSchema,
  getSchemaVersions,
} from "../services/schemaService";
import { validateAcls, AclEntry } from "../services/aclService";
import { auditAction } from "../middleware/audit";
import { enqueueJob } from "../services/jobService";
import { JobType } from "../models/job";

const router = Router({ mergeParams: true });

// POST /api/tenants/:id/connectors — Register connector
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.id;
    const validation = validateCreateConnector(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const { data } = validation;
    const now = new Date().toISOString();
    const connector: Connector = {
      id: uuid(),
      tenantId,
      connectionId: data.connectionId,
      displayName: data.displayName,
      hostingType: data.hostingType,
      status: "provisioning",
      endpoints: data.endpoints || {},
      dataSources: [],
      schemaVersion: "1.0",
      crawlSchedule: data.crawlSchedule || {
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
      createdAt: now,
      updatedAt: now,
    };

    const store = getStore();
    const created = await store.create<Connector>(CONNECTORS, connector);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id/connectors — List tenant's connectors
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.params.id;
    const store = getStore();
    const connectors = await store.getAll<Connector>(CONNECTORS, tenantId);
    res.json({ items: connectors, total: connectors.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/tenants/:id/connectors/:cid — Get connector detail
router.get(
  "/:cid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const connector = await store.getById<Connector>(
        CONNECTORS,
        req.params.cid,
        req.params.id
      );
      if (!connector) {
        res.status(404).json({ error: "Connector not found" });
        return;
      }
      res.json(connector);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/tenants/:id/connectors/:cid — Update connector
router.patch(
  "/:cid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = validateUpdateConnector(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const store = getStore();
      const updates = {
        ...validation.data,
        updatedAt: new Date().toISOString(),
      };
      const updated = await store.update<Connector>(
        CONNECTORS,
        req.params.cid,
        updates,
        req.params.id
      );
      if (!updated) {
        res.status(404).json({ error: "Connector not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/tenants/:id/connectors/:cid — Remove connector
router.delete(
  "/:cid",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const deleted = await store.delete(
        CONNECTORS,
        req.params.cid,
        req.params.id
      );
      if (!deleted) {
        res.status(404).json({ error: "Connector not found" });
        return;
      }
      res.json({ message: "Connector removed" });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/connectors/:cid/crawl — Trigger crawl via job queue
router.post(
  "/:cid/crawl",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const connector = await store.getById<Connector>(
        CONNECTORS,
        req.params.cid,
        req.params.id
      );
      if (!connector) {
        res.status(404).json({ error: "Connector not found" });
        return;
      }

      const crawlType =
        (req.body.type as string) === "incremental"
          ? "incremental-crawl"
          : "full-crawl";

      const job = await enqueueJob(req.params.id, req.params.cid, {
        type: crawlType as JobType,
        input: req.body,
      });

      res.status(202).json({
        message: "Crawl job enqueued",
        jobId: job.id,
        crawlType,
        status: job.status,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tenants/:id/connectors/:cid/health — Run health check
router.get(
  "/:cid/health",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const store = getStore();
      const connector = await store.getById<Connector>(
        CONNECTORS,
        req.params.cid,
        req.params.id
      );
      if (!connector) {
        res.status(404).json({ error: "Connector not found" });
        return;
      }

      const health = await checkConnectorHealth(connector);

      // Persist the health result
      await store.update<Connector>(
        CONNECTORS,
        req.params.cid,
        { health, updatedAt: new Date().toISOString() },
        req.params.id
      );

      res.json(health);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/connectors/:cid/acl/validate — Validate ACL entries
router.post(
  "/:cid/acl/validate",
  auditAction("connector.update"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.id;
      const acls = req.body.acls as AclEntry[] | undefined;

      if (!acls || !Array.isArray(acls)) {
        res
          .status(400)
          .json({ error: "Request body must include an 'acls' array" });
        return;
      }

      const result = await validateAcls(acls, tenantId);
      const status = result.blockIngestion ? 422 : 200;
      res.status(status).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// ── Schema version management routes ────────────────────────────────────────

// POST /api/tenants/:id/connectors/:cid/schema/draft — Create draft
router.post(
  "/:cid/schema/draft",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schema } = req.body;
      if (!schema || typeof schema !== "object") {
        res.status(400).json({ error: "schema object is required in request body" });
        return;
      }

      const version = await createDraft(req.params.id, req.params.cid, schema);
      const statusCode = version.status === "invalid" ? 422 : 201;
      res.status(statusCode).json(version);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/connectors/:cid/schema/validate — Validate a draft
router.post(
  "/:cid/schema/validate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { version } = req.body;
      if (typeof version === "number") {
        // Validate an existing version
        const result = await validateSchemaVersion(
          req.params.id,
          req.params.cid,
          version
        );
        if (!result) {
          res.status(404).json({ error: "Schema version not found" });
          return;
        }
        res.json(result);
      } else if (req.body.schema) {
        // Validate schema inline without storing
        const result = validateSchema(req.body.schema);
        res.json(result);
      } else {
        res.status(400).json({
          error: "Provide either 'version' (number) or 'schema' (object) to validate",
        });
      }
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/connectors/:cid/schema/promote — Promote version
router.post(
  "/:cid/schema/promote",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { version } = req.body;
      if (typeof version !== "number") {
        res.status(400).json({ error: "version (number) is required" });
        return;
      }

      const promoted = await promoteSchema(
        req.params.id,
        req.params.cid,
        version
      );
      if (!promoted) {
        res.status(404).json({ error: "Schema version not found" });
        return;
      }
      res.json(promoted);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tenants/:id/connectors/:cid/schema/versions — List versions
router.get(
  "/:cid/schema/versions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const versions = await getSchemaVersions(req.params.id, req.params.cid);
      res.json({ items: versions, total: versions.length });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
