import type { HumanitarianRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: HumanitarianRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized HumanitarianRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: HumanitarianRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Symbol_humanitarian_aid.svg/48px-Symbol_humanitarian_aid.svg.png",
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
      crisisType: record.crisisType,
      emergencyStatus: record.emergencyStatus,
      affectedPopulation: record.affectedPopulation,
      responseOrganization: record.responseOrganization,
      humanitarianSector: record.humanitarianSector,
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
function buildContentString(record: HumanitarianRecord): string {
  const sections: string[] = [
    record.title,
    "",
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.crisisType) {
    sections.push(`Crisis Type: ${record.crisisType}`);
  }
  if (record.emergencyStatus) {
    sections.push(`Emergency Status: ${record.emergencyStatus}`);
  }
  if (record.affectedPopulation > 0) {
    sections.push(`Affected Population: ${record.affectedPopulation.toLocaleString()}`);
  }
  if (record.responseOrganization) {
    sections.push(`Response Organization: ${record.responseOrganization}`);
  }
  if (record.humanitarianSector) {
    sections.push(`Humanitarian Sector: ${record.humanitarianSector}`);
  }

  sections.push(
    "",
    `Source: ${record.sourceOrganization} — ${record.datasetName}`,
    `Dataset URL: ${record.dataSourceUrl}`
  );

  if (record.contextNote) {
    sections.push("", record.contextNote);
  }

  return sections.join("\n");
}
