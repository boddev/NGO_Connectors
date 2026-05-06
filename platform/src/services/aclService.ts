// ── ACL Validation Service ───────────────────────────────────────────────────
//
// Validates ACL entries before ingestion and detects ACL drift between crawls.
// In production, user/group IDs would be verified via Graph API; for now we
// validate GUID format only.

export type AclAccessType = "grant" | "deny";
export type AclType = "everyone" | "user" | "group";

export interface AclEntry {
  accessType: AclAccessType;
  type: AclType;
  value: string;
}

export interface AclValidationResult {
  valid: boolean;
  totalEntries: number;
  resolvedEntries: number;
  unresolvedEntries: number;
  unresolvedIds: string[];
  blockIngestion: boolean;
  warnings: string[];
}

export interface AclDriftResult {
  driftDetected: boolean;
  driftPercentage: number;
  changedItems: string[];
}

const GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate a batch of ACL entries before ingestion.
 *
 * - `everyone` → always valid
 * - `user` / `group` → value must be a valid GUID
 * - `deny` entries generate warnings (should be used sparingly)
 * - Blocks ingestion when >5% of entries have invalid format
 */
export async function validateAcls(
  acls: AclEntry[],
  _tenantId: string
): Promise<AclValidationResult> {
  const warnings: string[] = [];
  const unresolvedIds: string[] = [];
  let resolvedEntries = 0;

  for (const acl of acls) {
    // Warn on deny entries — best practice is to use them sparingly
    if (acl.accessType === "deny") {
      warnings.push(
        `Deny ACL entry detected for ${acl.type}:${acl.value || "everyone"} — deny entries should be used sparingly`
      );
    }

    if (acl.type === "everyone") {
      // Always valid — this is what NGO connectors use
      resolvedEntries++;
      continue;
    }

    // user / group — validate GUID format
    if (!acl.value || !GUID_RE.test(acl.value)) {
      unresolvedIds.push(acl.value || "(empty)");
    } else {
      // In production: call Graph API GET /users/{id} or GET /groups/{id}
      resolvedEntries++;
    }
  }

  const totalEntries = acls.length;
  const unresolvedEntries = unresolvedIds.length;
  const unresolvedPct =
    totalEntries > 0 ? (unresolvedEntries / totalEntries) * 100 : 0;
  const blockIngestion = unresolvedPct > 5;

  if (blockIngestion) {
    warnings.push(
      `${unresolvedPct.toFixed(1)}% of ACL entries are unresolvable (threshold: 5%) — ingestion blocked`
    );
  }

  return {
    valid: unresolvedEntries === 0,
    totalEntries,
    resolvedEntries,
    unresolvedEntries,
    unresolvedIds,
    blockIngestion,
    warnings,
  };
}

/**
 * Detect ACL drift by comparing current vs. previously ingested ACLs.
 *
 * Returns the percentage of items whose ACL sets changed and which items
 * were affected.
 */
export async function checkAclDrift(
  _connectorId: string,
  currentAcls: Map<string, AclEntry[]>,
  previousAcls: Map<string, AclEntry[]>
): Promise<AclDriftResult> {
  const changedItems: string[] = [];

  // Check every item in current set
  for (const [itemId, currentEntries] of currentAcls) {
    const previousEntries = previousAcls.get(itemId);

    if (!previousEntries) {
      // New item — counts as drift
      changedItems.push(itemId);
      continue;
    }

    if (!aclSetsEqual(currentEntries, previousEntries)) {
      changedItems.push(itemId);
    }
  }

  // Items removed from current set are also drift
  for (const itemId of previousAcls.keys()) {
    if (!currentAcls.has(itemId)) {
      changedItems.push(itemId);
    }
  }

  const totalItems = new Set([
    ...currentAcls.keys(),
    ...previousAcls.keys(),
  ]).size;
  const driftPercentage =
    totalItems > 0 ? (changedItems.length / totalItems) * 100 : 0;

  return {
    driftDetected: changedItems.length > 0,
    driftPercentage: Math.round(driftPercentage * 100) / 100,
    changedItems,
  };
}

/** Compare two ACL entry arrays for equality (order-independent). */
function aclSetsEqual(a: AclEntry[], b: AclEntry[]): boolean {
  if (a.length !== b.length) return false;

  const serialize = (entry: AclEntry) =>
    `${entry.accessType}:${entry.type}:${entry.value}`;

  const setA = new Set(a.map(serialize));
  const setB = new Set(b.map(serialize));

  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}
