// ── Audit & Compliance Logger ────────────────────────────────────────────────
//
// Stores audit entries in a local JSON file (./data/audit-log.json).
// In production this would write to Azure Log Analytics.
// Keeps the last 10,000 entries in memory and auto-rotates.

import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const AUDIT_FILE = path.join(DATA_DIR, "audit-log.json");
const MAX_ENTRIES = 10_000;

export interface AuditEntry {
  id: string;
  timestamp: string;
  tenantId: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string;
  details: Record<string, unknown>;
  result: "success" | "failure" | "denied";
  ipAddress: string;
}

export type AuditAction =
  | "tenant.create"
  | "tenant.update"
  | "tenant.offboard"
  | "connector.create"
  | "connector.update"
  | "connector.delete"
  | "connector.provision"
  | "connector.crawl"
  | "upload.create"
  | "upload.delete"
  | "upload.ingest"
  | "schema.draft"
  | "schema.validate"
  | "schema.promote"
  | "secret.store"
  | "secret.delete"
  | "alert.acknowledge"
  | "alert.resolve"
  | "auth.login"
  | "auth.denied";

// In-memory ring buffer
let entries: AuditEntry[] = [];
let loaded = false;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadFromDisk(): void {
  if (loaded) return;
  ensureDataDir();
  if (fs.existsSync(AUDIT_FILE)) {
    try {
      entries = JSON.parse(fs.readFileSync(AUDIT_FILE, "utf-8"));
    } catch {
      entries = [];
    }
  }
  loaded = true;
}

function flushToDisk(): void {
  ensureDataDir();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * Log an audit entry. Automatically assigns id and timestamp.
 */
export function logAudit(
  entry: Omit<AuditEntry, "id" | "timestamp">
): void {
  loadFromDisk();

  const full: AuditEntry = {
    id: uuid(),
    timestamp: new Date().toISOString(),
    ...entry,
  };

  entries.push(full);

  // Auto-rotate: keep last MAX_ENTRIES
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }

  flushToDisk();
}

export interface AuditFilters {
  tenantId?: string;
  action?: string;
  since?: string;
  limit?: number;
}

/**
 * Query the audit log with optional filters.
 */
export function getAuditLog(filters: AuditFilters = {}): AuditEntry[] {
  loadFromDisk();

  let result = [...entries];

  if (filters.tenantId) {
    result = result.filter((e) => e.tenantId === filters.tenantId);
  }

  if (filters.action) {
    result = result.filter((e) => e.action === filters.action);
  }

  if (filters.since) {
    const since = new Date(filters.since).getTime();
    result = result.filter(
      (e) => new Date(e.timestamp).getTime() >= since
    );
  }

  // Newest first
  result.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const limit = filters.limit || 500;
  return result.slice(0, limit);
}
