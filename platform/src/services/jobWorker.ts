import { Job } from "../models/job";
import { Connector } from "../models/connector";
import { getStore, CONNECTORS } from "./cosmosService";
import {
  getNextJob,
  startJob,
  completeJob,
  failJob,
} from "./jobService";
import { checkConnectorHealth } from "./healthService";

const POLL_INTERVAL_MS = 5_000;
const CRAWL_TIMEOUT_MS = 30_000;

// ── Job executor dispatch ───────────────────────────────────────────────────

async function executeJob(job: Job): Promise<Record<string, unknown>> {
  switch (job.type) {
    case "full-crawl":
      return executeCrawl(job, "fullCrawl");
    case "incremental-crawl":
      return executeCrawl(job, "incrementalCrawl");
    case "upload-ingest":
      return executeUploadIngest(job);
    case "health-check":
      return executeHealthCheck(job);
    case "acl-reconciliation":
      return executeAclReconciliation(job);
    case "schema-promote":
      return executeSchemaPromote(job);
    default:
      throw new Error(`Unknown job type: ${job.type}`);
  }
}

// ── Crawl jobs ──────────────────────────────────────────────────────────────

async function executeCrawl(
  job: Job,
  crawlKey: "fullCrawl" | "incrementalCrawl"
): Promise<Record<string, unknown>> {
  const connector = await getConnector(job);
  const endpoint = connector.endpoints[crawlKey];
  if (!endpoint) {
    throw new Error(`Connector "${connector.displayName}" has no ${crawlKey} endpoint`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggeredBy: "job-worker", jobId: job.id, ...job.input }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(body);
    } catch {
      result = { raw: body };
    }

    if (!response.ok) {
      throw new Error(`Crawl endpoint returned ${response.status}: ${body.slice(0, 500)}`);
    }

    return { statusCode: response.status, ...result };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Upload-ingest job ───────────────────────────────────────────────────────

async function executeUploadIngest(job: Job): Promise<Record<string, unknown>> {
  const connector = await getConnector(job);
  const endpoint = connector.endpoints.fullCrawl;
  if (!endpoint) {
    throw new Error(`Connector "${connector.displayName}" has no crawl endpoint for upload ingest`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        triggeredBy: "job-worker",
        jobId: job.id,
        uploadId: job.input.uploadId,
        ...job.input,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = await response.text();
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(body);
    } catch {
      result = { raw: body };
    }

    if (!response.ok) {
      throw new Error(`Upload ingest returned ${response.status}: ${body.slice(0, 500)}`);
    }

    return { statusCode: response.status, ...result };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ── Health-check job ────────────────────────────────────────────────────────

async function executeHealthCheck(job: Job): Promise<Record<string, unknown>> {
  const connector = await getConnector(job);
  const health = await checkConnectorHealth(connector);

  // Persist the health result on the connector
  const store = getStore();
  await store.update<Connector>(CONNECTORS, connector.id, {
    health,
    updatedAt: new Date().toISOString(),
  } as Partial<Connector>, connector.tenantId);

  return { health };
}

// ── ACL reconciliation (stub) ───────────────────────────────────────────────

async function executeAclReconciliation(job: Job): Promise<Record<string, unknown>> {
  // Stub: in production this would call aclService.checkAclDrift()
  // with the connector's current vs. previous ACLs
  return {
    connectorId: job.connectorId,
    driftDetected: false,
    driftPercentage: 0,
    changedItems: [],
    message: "ACL reconciliation completed (stub — no drift detected)",
  };
}

// ── Schema promote ──────────────────────────────────────────────────────────

async function executeSchemaPromote(job: Job): Promise<Record<string, unknown>> {
  // Dynamically import to avoid circular dependency issues
  const { promoteSchema } = await import("./schemaService");
  const version = job.input.version as number | undefined;
  if (typeof version !== "number") {
    throw new Error("schema-promote job requires input.version (number)");
  }

  const promoted = await promoteSchema(job.tenantId, job.connectorId, version);
  if (!promoted) {
    throw new Error(`Schema version ${version} not found for connector ${job.connectorId}`);
  }

  return { promoted };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getConnector(job: Job): Promise<Connector> {
  const store = getStore();
  const connector = await store.getById<Connector>(CONNECTORS, job.connectorId, job.tenantId);
  if (!connector) {
    throw new Error(`Connector ${job.connectorId} not found`);
  }
  return connector;
}

// ── Background worker loop ──────────────────────────────────────────────────

let workerRunning = false;

export function startJobWorker(): void {
  if (workerRunning) return;
  workerRunning = true;
  console.log("[job-worker] Background job worker started (poll every 5s)");

  setInterval(async () => {
    try {
      const job = await getNextJob();
      if (!job) return;

      console.log(`[job-worker] Starting job ${job.id} (${job.type}) for tenant ${job.tenantId}`);
      await startJob(job.id);

      try {
        const result = await executeJob(job);
        await completeJob(job.id, result);
        console.log(`[job-worker] Job ${job.id} completed`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[job-worker] Job ${job.id} failed: ${message}`);
        await failJob(job.id, message);
      }
    } catch (err) {
      console.error("[job-worker] Error in worker loop:", err);
    }
  }, POLL_INTERVAL_MS);
}
