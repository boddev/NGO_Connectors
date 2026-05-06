export interface SchemaProperty {
  name: string;
  type:
    | "String"
    | "Int64"
    | "Double"
    | "DateTime"
    | "Boolean"
    | "StringCollection";
  isSearchable?: boolean;
  isQueryable?: boolean;
  isRetrievable?: boolean;
  isRefinable?: boolean;
  isExactMatchRequired?: boolean;
  labels?: string[];
  aliases?: string[];
}

/**
 * Combined schema: 14 common properties + 5 child-protection-specific.
 *
 * Rules enforced:
 *  - searchable and refinable are mutually exclusive
 *  - refinable must be set in the initial schema
 *  - properties with semantic labels must be retrievable
 *  - isExactMatchRequired only on non-searchable properties
 */
export const schema = {
  baseType: "microsoft.graph.externalItem" as const,
  properties: [
    // ── Common properties (shared across all NGO connectors) ──

    {
      name: "title",
      type: "String",
      isSearchable: true,
      isQueryable: true,
      isRetrievable: true,
      labels: ["title"],
    },
    {
      name: "itemUrl",
      type: "String",
      isRetrievable: true,
      labels: ["url"],
    },
    {
      name: "iconUrl",
      type: "String",
      isRetrievable: true,
      labels: ["iconUrl"],
    },
    {
      name: "lastModified",
      type: "DateTime",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      labels: ["lastModifiedDateTime"],
    },
    {
      name: "sourceOrganization",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      aliases: ["source", "provider"],
    },
    {
      name: "datasetName",
      type: "String",
      isSearchable: true,
      isQueryable: true,
      isRetrievable: true,
      aliases: ["dataset"],
    },
    {
      name: "country",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      aliases: ["nation"],
    },
    {
      name: "region",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
    },
    {
      name: "year",
      type: "Int64",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
    },
    {
      name: "indicatorName",
      type: "String",
      isSearchable: true,
      isQueryable: true,
      isRetrievable: true,
      aliases: ["indicator", "metric"],
    },
    {
      name: "indicatorValue",
      type: "String",
      isSearchable: true,
      isQueryable: true,
      isRetrievable: true,
    },
    {
      name: "tags",
      type: "StringCollection",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      isExactMatchRequired: true,
      aliases: ["labels", "categories"],
    },
    {
      name: "recordType",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
    },
    {
      name: "dataSourceUrl",
      type: "String",
      isRetrievable: true,
    },

    // ── Child Protection & Welfare-specific properties ──

    {
      name: "childProtectionIssue",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      aliases: ["issue", "protectionIssue", "childIssue"],
    },
    {
      name: "ageRange",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      aliases: ["ageGroup", "age"],
    },
    {
      name: "prevalenceRate",
      type: "Double",
      isQueryable: true,
      isRetrievable: true,
    },
    {
      name: "legalProtection",
      type: "Boolean",
      isQueryable: true,
      isRetrievable: true,
    },
    {
      name: "childWelfareDomain",
      type: "String",
      isQueryable: true,
      isRetrievable: true,
      isRefinable: true,
      aliases: ["domain", "welfareDomain"],
    },
  ] satisfies SchemaProperty[],
};
