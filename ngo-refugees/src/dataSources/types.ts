/** A normalized refugee/displacement data record ready for ingestion. */
export interface RefugeeRecord {
  /** Source-specific unique key used to build the item ID */
  sourceKey: string;
  title: string;
  country: string;
  countryISO3: string;
  region: string;
  year: number;
  indicatorName: string;
  indicatorValue: string;
  sourceOrganization: string;
  datasetName: string;
  dataSourceUrl: string;
  displacementType: string;
  populationGroup: string;
  countryOfOrigin: string;
  countryOfAsylum: string;
  displacedPopulation: number;
  tags: string[];
  recordType: "indicator" | "displacement" | "summary";
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
