import type { ConflictRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: ConflictRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Domain Summaries ──
  const domains = new Set(records.map((r) => r.conflictDomain).filter(Boolean));
  for (const domain of domains) {
    const domainRecords = records.filter((r) => r.conflictDomain === domain);
    summaries.push(buildDomainSummary(domain, domainRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: ConflictRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));
  const totalFatalities = records.reduce((sum, r) => sum + r.fatalities, 0);
  const eventRecords = records.filter((r) => r.recordType === "event");

  const content = [
    `Global Conflict & Security Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Conflict events: ${eventRecords.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    `Total fatalities reported: ${totalFatalities.toLocaleString()}`,
    ``,
    `Domains covered: ${[...new Set(records.map((r) => r.conflictDomain).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all conflict and security data`,
    `available in this connector. For specific events, countries, or indicators,`,
    `search by event type, country, conflict domain, or source organization.`,
  ].join("\n");

  return {
    id: "summary-global-conflict",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Conflict & Security Data Summary",
      itemUrl: "https://acleddata.com",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Nuvola_apps_kmines.svg/48px-Nuvola_apps_kmines.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Conflict Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Conflict & Security Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Conflict"],
      recordType: "summary",
      dataSourceUrl: "https://acleddata.com",
      eventType: "",
      conflictParty: "",
      fatalities: totalFatalities,
      eventDate: "",
      geoLocation: "",
      conflictDomain: "All",
    },
    content: { value: content, type: "text" },
  };
}

function buildDomainSummary(
  domain: string,
  records: ConflictRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];
  const totalFatalities = records.reduce((sum, r) => sum + r.fatalities, 0);
  const eventTypes = [...new Set(records.map((r) => r.eventType).filter(Boolean))];

  const content = [
    `${domain} Domain Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Total fatalities: ${totalFatalities.toLocaleString()}`,
    `Event types: ${eventTypes.join("; ") || "N/A"}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${domain.toLowerCase()} data in the connector.`,
  ].join("\n");

  const id = `summary-domain-${domain.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${domain} — Conflict & Security Data Summary`,
      itemUrl: "https://acleddata.com",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Nuvola_apps_kmines.svg/48px-Nuvola_apps_kmines.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Conflict Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${domain} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", domain],
      recordType: "summary",
      dataSourceUrl: "https://acleddata.com",
      eventType: "",
      conflictParty: "",
      fatalities: totalFatalities,
      eventDate: "",
      geoLocation: "",
      conflictDomain: domain,
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: ConflictRecord[]
): ExternalItemPayload {
  const datasets = new Map<string, { org: string; count: number }>();
  for (const r of records) {
    const key = r.datasetName;
    const existing = datasets.get(key);
    if (existing) {
      existing.count++;
    } else {
      datasets.set(key, { org: r.sourceOrganization, count: 1 });
    }
  }

  const lines = [
    `Dataset Inventory — NGO Conflict Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-conflict",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Conflict Connector — Dataset Inventory",
      itemUrl: "https://acleddata.com",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Nuvola_apps_kmines.svg/48px-Nuvola_apps_kmines.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Conflict Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://acleddata.com",
      eventType: "",
      conflictParty: "",
      fatalities: 0,
      eventDate: "",
      geoLocation: "",
      conflictDomain: "All",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
