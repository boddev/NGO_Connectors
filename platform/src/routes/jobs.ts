import { Router, Request, Response, NextFunction } from "express";
import {
  enqueueJob,
  getAllJobs,
  getQueueStats,
  getJobsByTenant,
  getJobsByConnector,
  cancelJob,
} from "../services/jobService";
import { validateCreateJob } from "../models/job";

const router = Router({ mergeParams: true });

// ── Observatory (platform-admin) routes ─────────────────────────────────────

// GET /api/observatory/jobs — All jobs
router.get(
  "/",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const jobs = await getAllJobs();
      // Sort newest first
      jobs.sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      res.json({ jobs, total: jobs.length });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/observatory/jobs/queue — Queue depth and running count
router.get(
  "/queue",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await getQueueStats();
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/observatory/jobs/:jobId/cancel — Cancel a job
router.patch(
  "/:jobId/cancel",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await cancelJob(req.params.jobId);
      if (!job) {
        res.status(404).json({ error: "Job not found or not cancellable" });
        return;
      }
      res.json(job);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

// ── Tenant-scoped routes (mounted under /api/tenants/:id) ───────────────────

export const tenantJobRoutes = Router({ mergeParams: true });

// GET /api/tenants/:id/jobs — Jobs for a tenant
tenantJobRoutes.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobs = await getJobsByTenant(req.params.id);
      jobs.sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      res.json({ jobs, total: jobs.length });
    } catch (err) {
      next(err);
    }
  }
);

// ── Connector-scoped routes (mounted under /api/tenants/:id/connectors/:cid) ─

export const connectorJobRoutes = Router({ mergeParams: true });

// GET /api/tenants/:id/connectors/:cid/jobs — Jobs for a connector
connectorJobRoutes.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobs = await getJobsByConnector(req.params.cid);
      jobs.sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
      );
      res.json({ jobs, total: jobs.length });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/tenants/:id/connectors/:cid/jobs — Enqueue a new job
connectorJobRoutes.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validation = validateCreateJob(req.body);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const job = await enqueueJob(
        req.params.id,
        req.params.cid,
        validation.data
      );
      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  }
);
