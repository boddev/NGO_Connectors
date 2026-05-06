import type { EnergyRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: EnergyRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized EnergyRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: EnergyRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Nuvola_apps_important_yellow.svg/48px-Nuvola_apps_important_yellow.svg.png",
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
      energySource: record.energySource,
      accessRate: record.accessRate,
      capacityMW: record.capacityMW,
      infrastructureType: record.infrastructureType,
      electrificationRate: record.electrificationRate,
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
function buildContentString(record: EnergyRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.energySource) {
    sections.push(`Energy Source: ${record.energySource}`);
  }
  if (record.infrastructureType) {
    sections.push(`Infrastructure Type: ${record.infrastructureType}`);
  }
  if (record.electrificationRate !== null) {
    sections.push(`Electrification Rate: ${record.electrificationRate}%`);
  }
  if (record.accessRate !== null) {
    sections.push(`Access Rate: ${record.accessRate}%`);
  }
  if (record.capacityMW !== null) {
    sections.push(`Capacity: ${record.capacityMW} MW`);
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
