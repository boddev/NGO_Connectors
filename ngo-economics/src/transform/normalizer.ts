import type { EconomicsRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: EconomicsRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized EconomicsRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: EconomicsRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
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
      economicIndicator: record.economicIndicator,
      gdpValue: record.gdpValue,
      giniCoefficient: record.giniCoefficient,
      incomeGroup: record.incomeGroup,
      developmentCategory: record.developmentCategory,
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
function buildContentString(record: EconomicsRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.economicIndicator) {
    sections.push(`Economic Category: ${record.economicIndicator}`);
  }
  if (record.gdpValue) {
    sections.push(`GDP Value: ${record.gdpValue}`);
  }
  if (record.giniCoefficient) {
    sections.push(`Gini Coefficient: ${record.giniCoefficient}`);
  }
  if (record.incomeGroup) {
    sections.push(`Income Group: ${record.incomeGroup}`);
  }
  if (record.developmentCategory) {
    sections.push(`Development Category: ${record.developmentCategory}`);
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
