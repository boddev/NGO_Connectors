import type { GenderRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: GenderRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized GenderRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: GenderRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Nuvola_apps_kmag.svg/48px-Nuvola_apps_kmag.svg.png",
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
      genderIndicator: record.genderIndicator,
      genderParityIndex: record.genderParityIndex,
      violenceType: record.violenceType,
      participationRate: record.participationRate,
      genderDomain: record.genderDomain,
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
function buildContentString(record: GenderRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue} ${record.measureUnit}`,
    `Year: ${record.year}`,
  ];

  if (record.genderDomain) {
    sections.push(`Gender Domain: ${record.genderDomain}`);
  }
  if (record.genderIndicator) {
    sections.push(`Gender Indicator: ${record.genderIndicator}`);
  }
  if (record.genderParityIndex) {
    sections.push(`Gender Parity Index: ${record.genderParityIndex}`);
  }
  if (record.participationRate) {
    sections.push(`Participation Rate: ${record.participationRate}%`);
  }
  if (record.violenceType) {
    sections.push(`Violence Type: ${record.violenceType}`);
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
