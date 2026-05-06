import { v4 as uuid } from "uuid";
import { getStore } from "./cosmosService";
import { SchemaVersion, SchemaVersionStatus } from "../models/schemaVersion";

const SCHEMA_VERSIONS = "schemaVersions";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateSchema(schema: unknown): SchemaValidationResult {
  const errors: string[] = [];

  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { valid: false, errors: ["Schema must be a non-null object"] };
  }

  const s = schema as Record<string, unknown>;

  // Check properties exist
  const properties = s.properties;
  if (!properties || !Array.isArray(properties)) {
    errors.push("Schema must include a 'properties' array");
    return { valid: false, errors };
  }

  // Property count limit
  if (properties.length > 128) {
    errors.push(
      `Schema has ${properties.length} properties — maximum is 128`
    );
  }

  if (properties.length === 0) {
    errors.push("Schema must have at least one property");
  }

  const VALID_TYPES = [
    "String",
    "Int64",
    "Double",
    "DateTime",
    "Boolean",
    "StringCollection",
    "Int64Collection",
    "DoubleCollection",
    "DateTimeCollection",
  ];

  // Track required labels
  const requiredLabels = new Set(["title", "url", "iconUrl"]);
  const foundLabels = new Set<string>();
  const propertyNames = new Set<string>();

  for (let i = 0; i < properties.length; i++) {
    const prop = properties[i] as Record<string, unknown>;

    if (!prop.name || typeof prop.name !== "string") {
      errors.push(`Property at index ${i} is missing a 'name' field`);
      continue;
    }

    if (propertyNames.has(prop.name)) {
      errors.push(`Duplicate property name: '${prop.name}'`);
    }
    propertyNames.add(prop.name);

    // Validate type
    if (!prop.type || !VALID_TYPES.includes(prop.type as string)) {
      errors.push(
        `Property '${prop.name}' has invalid type '${prop.type}' — must be one of: ${VALID_TYPES.join(", ")}`
      );
    }

    // Check searchable/refinable exclusivity
    if (prop.isSearchable && prop.isRefinable) {
      errors.push(
        `Property '${prop.name}' cannot be both searchable and refinable`
      );
    }

    // Track semantic labels
    if (prop.labels && Array.isArray(prop.labels)) {
      for (const label of prop.labels) {
        if (typeof label === "string") foundLabels.add(label);
      }
    }
  }

  // Check required labels
  for (const label of requiredLabels) {
    if (!foundLabels.has(label)) {
      errors.push(`Schema is missing required semantic label: '${label}'`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function createDraft(
  tenantId: string,
  connectorId: string,
  schema: object
): Promise<SchemaVersion> {
  const store = getStore();
  const existing = await store.getAll<SchemaVersion>(
    SCHEMA_VERSIONS,
    tenantId
  );
  const connectorVersions = existing.filter(
    (v) => v.connectorId === connectorId
  );
  const maxVersion = connectorVersions.reduce(
    (max, v) => Math.max(max, v.version),
    0
  );

  const validation = validateSchema(schema);

  const version: SchemaVersion = {
    id: uuid(),
    tenantId,
    connectorId,
    version: maxVersion + 1,
    status: validation.valid ? "valid" : "invalid",
    schema,
    validationErrors: validation.errors,
    createdAt: new Date().toISOString(),
    promotedAt: null,
  };

  await store.create<SchemaVersion>(SCHEMA_VERSIONS, version);
  return version;
}

export async function validateSchemaVersion(
  tenantId: string,
  connectorId: string,
  versionNumber: number
): Promise<SchemaVersion | null> {
  const store = getStore();
  const all = await store.getAll<SchemaVersion>(SCHEMA_VERSIONS, tenantId);
  const sv = all.find(
    (v) => v.connectorId === connectorId && v.version === versionNumber
  );
  if (!sv) return null;

  const validation = validateSchema(sv.schema);
  const newStatus: SchemaVersionStatus = validation.valid ? "valid" : "invalid";

  return store.update<SchemaVersion>(
    SCHEMA_VERSIONS,
    sv.id,
    {
      status: newStatus,
      validationErrors: validation.errors,
    } as Partial<SchemaVersion>,
    tenantId
  );
}

export async function promoteSchema(
  tenantId: string,
  connectorId: string,
  versionNumber: number
): Promise<SchemaVersion | null> {
  const store = getStore();
  const all = await store.getAll<SchemaVersion>(SCHEMA_VERSIONS, tenantId);
  const connectorVersions = all.filter((v) => v.connectorId === connectorId);

  const target = connectorVersions.find((v) => v.version === versionNumber);
  if (!target) return null;

  if (target.status !== "valid") {
    throw Object.assign(
      new Error(
        `Cannot promote schema version ${versionNumber} — status is '${target.status}', must be 'valid'`
      ),
      { statusCode: 400 }
    );
  }

  // Retire previously active version
  const currentActive = connectorVersions.find((v) => v.status === "active");
  if (currentActive) {
    await store.update<SchemaVersion>(
      SCHEMA_VERSIONS,
      currentActive.id,
      { status: "retired" } as Partial<SchemaVersion>,
      tenantId
    );
  }

  return store.update<SchemaVersion>(
    SCHEMA_VERSIONS,
    target.id,
    {
      status: "active",
      promotedAt: new Date().toISOString(),
    } as Partial<SchemaVersion>,
    tenantId
  );
}

export async function getSchemaVersions(
  tenantId: string,
  connectorId: string
): Promise<SchemaVersion[]> {
  const store = getStore();
  const all = await store.getAll<SchemaVersion>(SCHEMA_VERSIONS, tenantId);
  return all
    .filter((v) => v.connectorId === connectorId)
    .sort((a, b) => b.version - a.version);
}

export async function getActiveSchema(
  tenantId: string,
  connectorId: string
): Promise<SchemaVersion | null> {
  const versions = await getSchemaVersions(tenantId, connectorId);
  return versions.find((v) => v.status === "active") || null;
}
