import type { ConflictRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Build a deterministic, URL-safe item ID from a record's source key.
 * Strips any remaining unsafe characters.
 */
export function buildItemId(record: ConflictRecord): string {
  return record.sourceKey.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 128);
}

/**
 * Transform a normalized ConflictRecord into a Microsoft Graph external item payload.
 */
export function transformToExternalItem(
  record: ConflictRecord
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
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Nuvola_apps_kmines.svg/48px-Nuvola_apps_kmines.svg.png",
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
      eventType: record.eventType,
      conflictParty: record.conflictParty,
      fatalities: record.fatalities,
      eventDate: record.eventDate,
      geoLocation: record.geoLocation,
      conflictDomain: record.conflictDomain,
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
function buildContentString(record: ConflictRecord): string {
  const sections: string[] = [
    `Country: ${record.country} | Region: ${record.region}`,
    `Indicator: ${record.indicatorName}`,
    `Value: ${record.indicatorValue}`,
    `Year: ${record.year}`,
  ];

  if (record.conflictDomain) {
    sections.push(`Conflict Domain: ${record.conflictDomain}`);
  }
  if (record.eventType) {
    sections.push(`Event Type: ${record.eventType}`);
  }
  if (record.conflictParty) {
    sections.push(`Conflict Parties: ${record.conflictParty}`);
  }
  if (record.fatalities > 0) {
    sections.push(`Fatalities: ${record.fatalities}`);
  }
  if (record.geoLocation) {
    sections.push(`Location: ${record.geoLocation}`);
  }
  if (record.eventDate) {
    sections.push(`Event Date: ${record.eventDate}`);
  }

  sections.push(
    "",
    `Source: ${record.sourceOrganization} — ${record.datasetName}`,
    `Dataset URL: ${record.dataSourceUrl}`
  );

  if (record.methodologyNote) {
    sections.push("", `Notes: ${record.methodologyNote}`);
  }

  return sections.join("\n");
}
