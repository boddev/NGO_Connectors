import type { ChildProtectionRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: ChildProtectionRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized ChildProtectionRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: ChildProtectionRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/UNICEF_Logo.svg/48px-UNICEF_Logo.svg.png",
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
      childProtectionIssue: record.childProtectionIssue,
      ageRange: record.ageRange,
      prevalenceRate: record.prevalenceRate,
      legalProtection: record.legalProtection,
      childWelfareDomain: record.childWelfareDomain,
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
function buildContentString(record: ChildProtectionRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.childProtectionIssue) {
    sections.push(`Child Protection Issue: ${record.childProtectionIssue}`);
  }
  if (record.ageRange) {
    sections.push(`Age Range: ${record.ageRange}`);
  }
  if (record.childWelfareDomain) {
    sections.push(`Child Welfare Domain: ${record.childWelfareDomain}`);
  }
  if (record.prevalenceRate > 0) {
    sections.push(`Prevalence Rate: ${record.prevalenceRate}`);
  }
  if (record.legalProtection) {
    sections.push(`Legal Protection: Yes`);
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
