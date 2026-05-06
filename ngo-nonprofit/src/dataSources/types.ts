/** A normalized nonprofit data record ready for ingestion. */
export interface NonprofitRecord {
  /** Source-specific unique key used to build the item ID */
  sourceKey: string;
  title: string;
  country: string;
  region: string;
  year: number;
  indicatorName: string;
  indicatorValue: string;
  sourceOrganization: string;
  datasetName: string;
  dataSourceUrl: string;
  organizationName: string;
  ein: string;
  totalRevenue: number;
  totalExpenses: number;
  missionStatement: string;
  charityRating: number;
  tags: string[];
  recordType: "organization" | "filing" | "summary";
  lastModified: string; // ISO 8601
  /** Optional context note appended to content */
  contextNote?: string;
}

/** ACL entry for an external item. */
export interface AclEntry {
  type:
    | "everyone"
    | "everyoneExceptGuests"
    | "user"
    | "group"
    | "externalGroup";
  value: string;
  accessType: "grant" | "deny";
}

/** Payload for PUT /external/connections/{connectionId}/items/{itemId}. */
export interface ExternalItemPayload {
  id: string;
  acl: AclEntry[];
  properties: Record<string, unknown>;
  content: {
    value: string;
    type: "text" | "html";
  };
}
