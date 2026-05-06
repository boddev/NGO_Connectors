import type { MultiSectorRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: MultiSectorRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized MultiSectorRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: MultiSectorRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Sustainable_Development_Goals.svg/48px-Sustainable_Development_Goals.svg.png",
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
      sdgGoal: record.sdgGoal,
      sdgTarget: record.sdgTarget,
      sectorClassification: record.sectorClassification,
      dataFrequency: record.dataFrequency,
      dataFormat: record.dataFormat,
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
function buildContentString(record: MultiSectorRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue} ${record.measureUnit}`,
    `Year: ${record.year}`,
  ];

  if (record.sdgGoal) {
    sections.push(`SDG Goal: ${record.sdgGoal}`);
  }
  if (record.sdgTarget) {
    sections.push(`SDG Target: ${record.sdgTarget}`);
  }
  if (record.sectorClassification) {
    sections.push(`Sector: ${record.sectorClassification}`);
  }
  if (record.dataFrequency) {
    sections.push(`Data Frequency: ${record.dataFrequency}`);
  }
  if (record.dataFormat) {
    sections.push(`Data Format: ${record.dataFormat}`);
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
