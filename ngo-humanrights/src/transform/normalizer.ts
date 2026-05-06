import type { GovernanceRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: GovernanceRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized GovernanceRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: GovernanceRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Nuvola_apps_ksysguard.svg/48px-Nuvola_apps_ksysguard.svg.png",
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
      governanceIndicator: record.governanceIndicator,
      indexScore: record.indexScore,
      indexRank: record.indexRank,
      rightsDomain: record.rightsDomain,
      assessmentYear: record.assessmentYear,
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
function buildContentString(record: GovernanceRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.governanceIndicator) {
    sections.push(`Governance Indicator: ${record.governanceIndicator}`);
  }
  if (record.indexScore !== 0) {
    sections.push(`Score: ${record.indexScore}`);
  }
  if (record.indexRank > 0) {
    sections.push(`Rank: ${record.indexRank}`);
  }
  if (record.rightsDomain) {
    sections.push(`Rights Domain: ${record.rightsDomain}`);
  }
  if (record.assessmentYear > 0) {
    sections.push(`Assessment Year: ${record.assessmentYear}`);
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
