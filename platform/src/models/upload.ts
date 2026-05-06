import { UploadFormat, UploadStatus } from "../types";

export interface Upload {
  id: string;
  tenantId: string;
  connectorId: string;
  fileName: string;
  format: UploadFormat;
  sizeMB: number;
  status: UploadStatus;
  recordCount: number;
  validationResult: {
    valid: boolean;
    errors: string[];
  };
  ingestionResult: {
    succeeded: number;
    failed: number;
    errors: string[];
  } | null;
  uploadedAt: string;
  ingestedAt: string | null;
  purgeAfter: string | null;
}

const VALID_FORMATS: UploadFormat[] = ["csv", "json", "jsonl"];

export interface CreateUploadInput {
  fileName: string;
  format: UploadFormat;
  sizeMB: number;
  recordCount: number;
}

export function validateCreateUpload(
  body: unknown
):
  | { valid: true; data: CreateUploadInput }
  | { valid: false; error: string } {
  const b = body as Record<string, unknown>;

  if (!b || typeof b !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }
  if (!b.fileName || typeof b.fileName !== "string") {
    return {
      valid: false,
      error: "fileName is required and must be a string",
    };
  }
  if (!b.format || !VALID_FORMATS.includes(b.format as UploadFormat)) {
    return {
      valid: false,
      error: `format must be one of: ${VALID_FORMATS.join(", ")}`,
    };
  }
  if (typeof b.sizeMB !== "number" || b.sizeMB <= 0) {
    return {
      valid: false,
      error: "sizeMB is required and must be a positive number",
    };
  }
  if (typeof b.recordCount !== "number" || b.recordCount < 0) {
    return {
      valid: false,
      error: "recordCount is required and must be a non-negative number",
    };
  }

  return {
    valid: true,
    data: {
      fileName: b.fileName as string,
      format: b.format as UploadFormat,
      sizeMB: b.sizeMB as number,
      recordCount: b.recordCount as number,
    },
  };
}
