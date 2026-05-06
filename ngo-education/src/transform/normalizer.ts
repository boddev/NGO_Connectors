import type { EducationRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: EducationRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized EducationRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: EducationRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Nuvola_apps_bookcase.svg/48px-Nuvola_apps_bookcase.svg.png",
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
      educationLevel: record.educationLevel,
      enrollmentType: record.enrollmentType,
      genderParity: record.genderParity,
      literacyRate: record.literacyRate,
      educationDomain: record.educationDomain,
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
function buildContentString(record: EducationRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue} ${record.measureUnit}`,
    `Year: ${record.year}`,
  ];

  if (record.educationLevel) {
    sections.push(`Education Level: ${record.educationLevel}`);
  }
  if (record.enrollmentType) {
    sections.push(`Enrollment Type: ${record.enrollmentType}`);
  }
  if (record.genderParity) {
    sections.push(`Gender Parity Index: ${record.genderParity}`);
  }
  if (record.educationDomain) {
    sections.push(`Domain: ${record.educationDomain}`);
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
