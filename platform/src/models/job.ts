export type JobType =
  | "full-crawl"
  | "incremental-crawl"
  | "upload-ingest"
  | "health-check"
  | "acl-reconciliation"
  | "schema-promote";

export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job {
  id: string;
  tenantId: string;
  connectorId: string;
  type: JobType;
  status: JobStatus;
  priority: number; // 1=highest, 5=lowest
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  retryCount: number;
  maxRetries: number;
}

const VALID_JOB_TYPES: JobType[] = [
  "full-crawl",
  "incremental-crawl",
  "upload-ingest",
  "health-check",
  "acl-reconciliation",
  "schema-promote",
];

/** Default priority by job type (1 = highest). */
export const JOB_TYPE_PRIORITY: Record<JobType, number> = {
  "health-check": 1,
  "upload-ingest": 2,
  "full-crawl": 3,
  "incremental-crawl": 3,
  "acl-reconciliation": 4,
  "schema-promote": 4,
};

/** Transient job types that support automatic retry. */
const RETRYABLE_TYPES: Set<JobType> = new Set([
  "full-crawl",
  "incremental-crawl",
  "upload-ingest",
  "health-check",
]);

export function isRetryable(type: JobType): boolean {
  return RETRYABLE_TYPES.has(type);
}

/** Exponential backoff delays in ms: 1 min, 5 min, 15 min. */
export const RETRY_DELAYS_MS = [60_000, 300_000, 900_000];

export interface CreateJobInput {
  type: JobType;
  input?: Record<string, unknown>;
}

export function validateCreateJob(
  body: unknown
): { valid: true; data: CreateJobInput } | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!b.type || !VALID_JOB_TYPES.includes(b.type as JobType)) {
    return {
      valid: false,
      error: `type must be one of: ${VALID_JOB_TYPES.join(", ")}`,
    };
  }

  return {
    valid: true,
    data: {
      type: b.type as JobType,
      input: (b.input as Record<string, unknown>) || {},
    },
  };
}
