/** A normalized healthcare data record ready for ingestion. */
export interface HealthRecord {
  /** Source-specific unique key used to build the item ID */
  sourceKey: string;
  title: string;
  country: string;
  countryISO3: string;
  region: string;
  year: number;
  indicatorName: string;
  indicatorValue: string;
  measureUnit: string;
  sourceOrganization: string;
  datasetName: string;
  dataSourceUrl: string;
  diseaseOrCondition: string;
  ageGroup: string;
  sex: string;
  healthDomain: string;
  tags: string[];
  recordType: "indicator" | "summary";
  lastModified: string; // ISO 8601
  /** Optional methodology or context note appended to content */
  methodologyNote?: string;
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
