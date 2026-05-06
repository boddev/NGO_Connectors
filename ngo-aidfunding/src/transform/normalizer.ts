import type { AidFundingRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: AidFundingRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized AidFundingRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: AidFundingRecord
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
      donorOrganization: record.donorOrganization,
      recipientCountry: record.recipientCountry,
      aidSector: record.aidSector,
      disbursementAmount: record.disbursementAmount,
      aidType: record.aidType,
      currency: record.currency,
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
function buildContentString(record: AidFundingRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.donorOrganization) {
    sections.push(`Donor Organization: ${record.donorOrganization}`);
  }
  if (record.recipientCountry) {
    sections.push(`Recipient Country: ${record.recipientCountry}`);
  }
  if (record.aidSector) {
    sections.push(`Aid Sector: ${record.aidSector}`);
  }
  if (record.disbursementAmount) {
    sections.push(
      `Disbursement Amount: ${record.disbursementAmount} ${record.currency}`
    );
  }
  if (record.aidType) {
    sections.push(`Aid Type: ${record.aidType}`);
  }
  if (record.currency) {
    sections.push(`Currency: ${record.currency}`);
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
