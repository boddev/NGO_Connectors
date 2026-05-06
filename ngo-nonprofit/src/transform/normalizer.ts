import type { NonprofitRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: NonprofitRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized NonprofitRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: NonprofitRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Symbol_thumbs_up.svg/48px-Symbol_thumbs_up.svg.png",
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
      organizationName: record.organizationName,
      ein: record.ein,
      totalRevenue: record.totalRevenue,
      totalExpenses: record.totalExpenses,
      missionStatement: record.missionStatement,
      charityRating: record.charityRating,
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
function buildContentString(record: NonprofitRecord): string {
  const sections: string[] = [
    `Organization: ${record.organizationName}`,
    `Country: ${record.country} | Region: ${record.region}`,
  ];

  if (record.ein) {
    sections.push(`EIN / Charity Number: ${record.ein}`);
  }

  sections.push(`Indicator: ${record.indicatorName}`);
  sections.push(`Value: ${record.indicatorValue}`);

  if (record.year > 0) {
    sections.push(`Year: ${record.year}`);
  }

  if (record.totalRevenue > 0) {
    sections.push(`Total Revenue: $${record.totalRevenue.toLocaleString()}`);
  }
  if (record.totalExpenses > 0) {
    sections.push(`Total Expenses: $${record.totalExpenses.toLocaleString()}`);
  }
  if (record.missionStatement) {
    sections.push(`Mission: ${record.missionStatement}`);
  }
  if (record.charityRating > 0) {
    sections.push(`Charity Rating: ${record.charityRating}/100`);
  }

  sections.push(
    "",
    `Source: ${record.sourceOrganization} — ${record.datasetName}`,
    `Dataset URL: ${record.dataSourceUrl}`
  );

  if (record.contextNote) {
    sections.push("", `Details: ${record.contextNote}`);
  }

  return sections.join("\n");
}
