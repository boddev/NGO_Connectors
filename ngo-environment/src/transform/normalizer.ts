import type { EnvironmentRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: EnvironmentRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized EnvironmentRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: EnvironmentRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Nuvola_apps_kcoloredit.svg/48px-Nuvola_apps_kcoloredit.svg.png",
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
      environmentalDomain: record.environmentalDomain,
      emissionType: record.emissionType,
      speciesName: record.speciesName,
      conservationStatus: record.conservationStatus,
      measureUnit: record.measureUnit,
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
function buildContentString(record: EnvironmentRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue} ${record.measureUnit}`,
    `Year: ${record.year}`,
  ];

  if (record.environmentalDomain) {
    sections.push(`Environmental Domain: ${record.environmentalDomain}`);
  }
  if (record.emissionType) {
    sections.push(`Emission Type: ${record.emissionType}`);
  }
  if (record.speciesName) {
    sections.push(`Species: ${record.speciesName}`);
  }
  if (record.conservationStatus) {
    sections.push(`Conservation Status: ${record.conservationStatus}`);
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
