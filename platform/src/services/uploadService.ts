import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { getStore, UPLOADS } from "./cosmosService";
import { Upload } from "../models/upload";
import { UploadFormat, UploadStatus } from "../types";

const UPLOADS_DIR = path.join(__dirname, "..", "..", "data", "uploads");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export interface UploadResult {
  upload: Upload;
  errors: string[];
}

export function validateUpload(
  format: UploadFormat,
  data: string
): { valid: boolean; errors: string[]; recordCount: number } {
  const errors: string[] = [];
  let recordCount = 0;

  if (!data || data.length === 0) {
    return { valid: false, errors: ["Upload data is empty"], recordCount: 0 };
  }

  // 50 MB limit
  const sizeMB = Buffer.byteLength(data, "utf-8") / (1024 * 1024);
  if (sizeMB > 50) {
    errors.push(`File exceeds maximum size of 50 MB (${sizeMB.toFixed(1)} MB)`);
  }

  if (format === "json") {
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        recordCount = parsed.length;
        if (recordCount === 0) errors.push("JSON array is empty");
      } else if (typeof parsed === "object" && parsed !== null) {
        recordCount = 1;
      } else {
        errors.push("JSON must be an array of objects or a single object");
      }
    } catch {
      errors.push("Invalid JSON: could not parse");
    }
  } else if (format === "jsonl") {
    const lines = data.split("\n").filter((l) => l.trim().length > 0);
    for (let i = 0; i < lines.length; i++) {
      try {
        JSON.parse(lines[i]);
        recordCount++;
      } catch {
        errors.push(`Invalid JSON on line ${i + 1}`);
        if (errors.length >= 10) {
          errors.push("...additional errors truncated");
          break;
        }
      }
    }
    if (recordCount === 0 && errors.length === 0) {
      errors.push("JSONL file contains no records");
    }
  } else if (format === "csv") {
    const lines = data.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      errors.push("CSV must have a header row and at least one data row");
    } else {
      const headerCols = lines[0].split(",").length;
      recordCount = lines.length - 1; // exclude header
      for (let i = 1; i < Math.min(lines.length, 20); i++) {
        const cols = lines[i].split(",").length;
        if (cols !== headerCols) {
          errors.push(
            `Row ${i + 1} has ${cols} columns but header has ${headerCols}`
          );
        }
      }
    }
  } else {
    errors.push(`Unsupported format: ${format}`);
  }

  return { valid: errors.length === 0, errors, recordCount };
}

export async function processUpload(
  tenantId: string,
  connectorId: string,
  fileName: string,
  format: UploadFormat,
  data: string
): Promise<UploadResult> {
  const validation = validateUpload(format, data);
  const uploadId = uuid();
  const now = new Date().toISOString();
  const sizeMB =
    Math.round((Buffer.byteLength(data, "utf-8") / (1024 * 1024)) * 100) / 100;

  const status: UploadStatus = validation.valid ? "staged" : "quarantined";

  // Write file to local storage
  const uploadDir = path.join(UPLOADS_DIR, tenantId, connectorId, uploadId);
  ensureDir(uploadDir);
  fs.writeFileSync(path.join(uploadDir, fileName), data, "utf-8");
  fs.writeFileSync(
    path.join(uploadDir, "_meta.json"),
    JSON.stringify(
      { fileName, format, sizeMB, recordCount: validation.recordCount },
      null,
      2
    ),
    "utf-8"
  );

  const upload: Upload = {
    id: uploadId,
    tenantId,
    connectorId,
    fileName,
    format,
    sizeMB,
    status,
    recordCount: validation.recordCount,
    validationResult: {
      valid: validation.valid,
      errors: validation.errors,
    },
    ingestionResult: null,
    uploadedAt: now,
    ingestedAt: null,
    purgeAfter: null,
  };

  const store = getStore();
  await store.create<Upload>(UPLOADS, upload);

  return { upload, errors: validation.errors };
}

export async function getUploadStatus(
  uploadId: string
): Promise<Upload | null> {
  const store = getStore();
  return store.getById<Upload>(UPLOADS, uploadId);
}

export async function deleteUploadData(
  tenantId: string,
  connectorId: string,
  uploadId: string
): Promise<boolean> {
  // Remove stored files
  const uploadDir = path.join(UPLOADS_DIR, tenantId, connectorId, uploadId);
  if (fs.existsSync(uploadDir)) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  }

  // Remove record
  const store = getStore();
  return store.delete(UPLOADS, uploadId, tenantId);
}

export async function markIngesting(uploadId: string, tenantId: string): Promise<Upload | null> {
  const store = getStore();
  return store.update<Upload>(UPLOADS, uploadId, {
    status: "ingesting",
  } as Partial<Upload>, tenantId);
}

export async function purgeExpiredUploads(): Promise<number> {
  const store = getStore();
  const all = await store.getAll<Upload>(UPLOADS);
  const now = new Date();
  let purged = 0;

  for (const upload of all) {
    if (upload.purgeAfter && new Date(upload.purgeAfter) <= now) {
      await deleteUploadData(
        upload.tenantId,
        upload.connectorId,
        upload.id
      );
      purged++;
    }
  }

  return purged;
}
