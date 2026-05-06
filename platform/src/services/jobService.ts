import { v4 as uuid } from "uuid";
import { getStore, JOBS } from "./cosmosService";
import {
  Job,
  JobType,
  JobStatus,
  JOB_TYPE_PRIORITY,
  isRetryable,
  RETRY_DELAYS_MS,
  CreateJobInput,
} from "../models/job";

// ── Concurrency constants ───────────────────────────────────────────────────

const MAX_RUNNING_PER_TENANT = 2;
const MAX_RUNNING_PLATFORM = 50;

// ── Enqueue ─────────────────────────────────────────────────────────────────

export async function enqueueJob(
  tenantId: string,
  connectorId: string,
  input: CreateJobInput
): Promise<Job> {
  const store = getStore();
  const now = new Date().toISOString();
  const maxRetries = isRetryable(input.type) ? 3 : 0;

  const job: Job = {
    id: uuid(),
    tenantId,
    connectorId,
    type: input.type,
    status: "queued",
    priority: JOB_TYPE_PRIORITY[input.type],
    input: input.input || {},
    result: null,
    error: null,
    scheduledAt: now,
    startedAt: null,
    completedAt: null,
    retryCount: 0,
    maxRetries,
  };

  await store.create<Job>(JOBS, job);
  return job;
}

// ── Scheduling / picking ────────────────────────────────────────────────────

/**
 * Pick the next eligible job from the queue, respecting concurrency limits.
 * Returns null when no job is available.
 */
export async function getNextJob(): Promise<Job | null> {
  const store = getStore();
  const all = await store.getAll<Job>(JOBS);

  const running = all.filter((j) => j.status === "running");

  // Platform-wide cap
  if (running.length >= MAX_RUNNING_PLATFORM) return null;

  // Count running jobs per tenant
  const runningByTenant = new Map<string, number>();
  for (const j of running) {
    runningByTenant.set(j.tenantId, (runningByTenant.get(j.tenantId) ?? 0) + 1);
  }

  // Eligible queued jobs: sorted by priority ASC, then scheduledAt ASC (FIFO within priority)
  const queued = all
    .filter((j) => j.status === "queued")
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    });

  for (const job of queued) {
    const tenantRunning = runningByTenant.get(job.tenantId) ?? 0;
    if (tenantRunning < MAX_RUNNING_PER_TENANT) {
      return job;
    }
  }

  return null;
}

// ── Lifecycle transitions ───────────────────────────────────────────────────

export async function startJob(jobId: string): Promise<Job | null> {
  const store = getStore();
  return store.update<Job>(JOBS, jobId, {
    status: "running",
    startedAt: new Date().toISOString(),
  } as Partial<Job>);
}

export async function completeJob(
  jobId: string,
  result: Record<string, unknown>
): Promise<Job | null> {
  const store = getStore();
  return store.update<Job>(JOBS, jobId, {
    status: "completed",
    result,
    completedAt: new Date().toISOString(),
  } as Partial<Job>);
}

export async function failJob(
  jobId: string,
  error: string
): Promise<Job | null> {
  const store = getStore();
  const job = await store.getById<Job>(JOBS, jobId);
  if (!job) return null;

  const newRetry = job.retryCount + 1;
  const canRetry = isRetryable(job.type) && newRetry <= job.maxRetries;

  if (canRetry) {
    // Re-queue with a delayed scheduledAt (exponential backoff)
    const delayMs = RETRY_DELAYS_MS[Math.min(newRetry - 1, RETRY_DELAYS_MS.length - 1)];
    const retryAt = new Date(Date.now() + delayMs).toISOString();
    return store.update<Job>(JOBS, jobId, {
      status: "queued",
      retryCount: newRetry,
      error,
      scheduledAt: retryAt,
      startedAt: null,
    } as Partial<Job>);
  }

  return store.update<Job>(JOBS, jobId, {
    status: "failed",
    retryCount: newRetry,
    error,
    completedAt: new Date().toISOString(),
  } as Partial<Job>);
}

export async function cancelJob(jobId: string): Promise<Job | null> {
  const store = getStore();
  const job = await store.getById<Job>(JOBS, jobId);
  if (!job) return null;
  if (job.status !== "queued" && job.status !== "running") return null;

  return store.update<Job>(JOBS, jobId, {
    status: "cancelled",
    completedAt: new Date().toISOString(),
  } as Partial<Job>);
}

// ── Queries ─────────────────────────────────────────────────────────────────

export async function getJobsByTenant(tenantId: string): Promise<Job[]> {
  const store = getStore();
  return store.getAll<Job>(JOBS, tenantId);
}

export async function getJobsByConnector(connectorId: string): Promise<Job[]> {
  const store = getStore();
  const all = await store.getAll<Job>(JOBS);
  return all.filter((j) => j.connectorId === connectorId);
}

export async function getRunningJobs(): Promise<Job[]> {
  const store = getStore();
  const all = await store.getAll<Job>(JOBS);
  return all.filter((j) => j.status === "running");
}

export async function getQueueDepth(): Promise<number> {
  const store = getStore();
  const all = await store.getAll<Job>(JOBS);
  return all.filter((j) => j.status === "queued").length;
}

export async function getAllJobs(): Promise<Job[]> {
  const store = getStore();
  return store.getAll<Job>(JOBS);
}

export async function getQueueStats(): Promise<{
  queued: number;
  running: number;
  completedLast24h: number;
  failedLast24h: number;
}> {
  const store = getStore();
  const all = await store.getAll<Job>(JOBS);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  return {
    queued: all.filter((j) => j.status === "queued").length,
    running: all.filter((j) => j.status === "running").length,
    completedLast24h: all.filter(
      (j) => j.status === "completed" && j.completedAt && j.completedAt >= cutoff
    ).length,
    failedLast24h: all.filter(
      (j) => j.status === "failed" && j.completedAt && j.completedAt >= cutoff
    ).length,
  };
}
