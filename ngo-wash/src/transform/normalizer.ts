import type { WashRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: WashRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized WashRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: WashRecord
): ExternalItemPayload {
  return {
    id: buildItemId(record),

    acl: [
      {
        type: "everyone",
        value: "everyone",
        accessType: "grant",
      },
    ],

    properties: {
      title: record.title,
      itemUrl: record.dataSourceUrl,
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Drinking_water.jpg/48px-Drinking_water.jpg",
      lastModified: record.lastModified,
      sourceOrganization: record.sourceOrganization,
      datasetName: record.datasetName,
      country: record.country,
      region: record.region,
      year: record.year,
      indicatorName: record.indicatorName,
      indicatorValue: record.indicatorValue,
      "tags@odata.type": "Collection(Edm.String)",
      tags: record.tags,
      recordType: record.recordType,
      dataSourceUrl: record.dataSourceUrl,
      washService: record.washService,
      serviceLevel: record.serviceLevel,
      coveragePercent: record.coveragePercent,
      waterSourceType: record.waterSourceType,
      urbanRural: record.urbanRural,
    },

    content: {
      value: buildContentString(record),
      type: "text",
    },
  };
}

/**
 * Build a rich content string for Copilot summarization and full-text search.
 * Leads with the most important information per best practices.
 */
function buildContentString(record: WashRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `WASH Service: ${record.washService}`,
    `Service Level: ${record.serviceLevel}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Coverage: ${record.coveragePercent.toFixed(1)}%`,
    `Year: ${record.year}`,
  ];

  if (record.urbanRural) {
    sections.push(`Setting: ${record.urbanRural}`);
  }
  if (record.waterSourceType) {
    sections.push(`Water Source Type: ${record.waterSourceType}`);
  }

  sections.push(
    "",
    `Source: ${record.sourceOrganization} — ${record.datasetName}`,
    `Dataset URL: ${record.dataSourceUrl}`
  );

  if (record.methodologyNote) {
    sections.push("", `Methodology: ${record.methodologyNote}`);
  }

  return sections.join("\n");
}
