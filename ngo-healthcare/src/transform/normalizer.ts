import type { HealthRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: HealthRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized HealthRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: HealthRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Caduceus.svg/48px-Caduceus.svg.png",
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
      diseaseOrCondition: record.diseaseOrCondition,
      ageGroup: record.ageGroup,
      sex: record.sex,
      measureUnit: record.measureUnit,
      healthDomain: record.healthDomain,
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
function buildContentString(record: HealthRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue} ${record.measureUnit}`,
    `Year: ${record.year}`,
  ];

  if (record.diseaseOrCondition) {
    sections.push(`Disease/Condition: ${record.diseaseOrCondition}`);
  }
  if (record.ageGroup) {
    sections.push(`Age Group: ${record.ageGroup}`);
  }
  if (record.sex) {
    sections.push(`Sex: ${record.sex}`);
  }
  if (record.healthDomain) {
    sections.push(`Health Domain: ${record.healthDomain}`);
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
