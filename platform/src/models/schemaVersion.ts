export type SchemaVersionStatus =
  | "draft"
  | "validating"
  | "valid"
  | "invalid"
  | "active"
  | "retired";

export interface SchemaVersion {
  id: string;
  tenantId: string;
  connectorId: string;
  version: number;
  status: SchemaVersionStatus;
  schema: object;
  validationErrors: string[];
  createdAt: string;
  promotedAt: string | null;
}
