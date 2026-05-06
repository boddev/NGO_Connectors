import type { AgricultureRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: AgricultureRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized AgricultureRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: AgricultureRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/FAO_logo.svg/48px-FAO_logo.svg.png",
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
      agriculturalDomain: record.agriculturalDomain,
      cropOrCommodity: record.cropOrCommodity,
      foodSecurityPhase: record.foodSecurityPhase,
      productionVolume: record.productionVolume,
      tradeFlow: record.tradeFlow,
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
function buildContentString(record: AgricultureRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.agriculturalDomain) {
    sections.push(`Agricultural Domain: ${record.agriculturalDomain}`);
  }
  if (record.cropOrCommodity) {
    sections.push(`Crop/Commodity: ${record.cropOrCommodity}`);
  }
  if (record.foodSecurityPhase) {
    sections.push(`Food Security Phase: ${record.foodSecurityPhase}`);
  }
  if (record.productionVolume > 0) {
    sections.push(`Production Volume: ${record.productionVolume} tonnes`);
  }
  if (record.tradeFlow) {
    sections.push(`Trade Flow: ${record.tradeFlow}`);
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
