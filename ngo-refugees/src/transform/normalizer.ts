import type { RefugeeRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: RefugeeRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized RefugeeRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: RefugeeRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/UNHCR.svg/48px-UNHCR.svg.png",
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
      displacementType: record.displacementType,
      populationGroup: record.populationGroup,
      countryOfOrigin: record.countryOfOrigin,
      countryOfAsylum: record.countryOfAsylum,
      displacedPopulation: record.displacedPopulation,
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
function buildContentString(record: RefugeeRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.displacementType) {
    sections.push(`Displacement Type: ${record.displacementType}`);
  }
  if (record.populationGroup) {
    sections.push(`Population Group: ${record.populationGroup}`);
  }
  if (record.countryOfOrigin) {
    sections.push(`Country of Origin: ${record.countryOfOrigin}`);
  }
  if (record.countryOfAsylum) {
    sections.push(`Country of Asylum: ${record.countryOfAsylum}`);
  }
  if (record.displacedPopulation > 0) {
    sections.push(
      `Total Displaced Population: ${record.displacedPopulation.toLocaleString()}`
    );
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
