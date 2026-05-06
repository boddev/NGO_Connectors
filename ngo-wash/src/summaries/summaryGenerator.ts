import type { WashRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: WashRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Service Summaries (Drinking Water, Sanitation, Hygiene) ──
  const services = new Set(records.map((r) => r.washService).filter(Boolean));
  for (const service of services) {
    const serviceRecords = records.filter((r) => r.washService === service);
    summaries.push(buildServiceSummary(service, serviceRecords));
  }

  // ── Urban vs Rural Disparity Summary ──
  summaries.push(buildUrbanRuralSummary(records));

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: WashRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));

  const washServices = [...new Set(records.map((r) => r.washService).filter(Boolean))];

  const content = [
    `Global Water, Sanitation & Hygiene (WASH) Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `WASH services covered: ${washServices.join(", ")}`,
    `Service levels: Safely managed, Basic, Limited, Unimproved, No service`,
    `Disaggregation: Total, Urban, Rural`,
    ``,
    `This summary provides an overview of all WASH data available in this connector.`,
    `For specific indicators or countries, search by WASH service, country, or service level.`,
  ].join("\n");

  return {
    id: "summary-global-wash",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Water, Sanitation & Hygiene (WASH) Data Summary",
      itemUrl: "https://washdata.org/data",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Drinking_water.jpg/48px-Drinking_water.jpg",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO WASH Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "WASH Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "WASH"],
      recordType: "summary",
      dataSourceUrl: "https://washdata.org/data",
      washService: "All",
      serviceLevel: "",
      coveragePercent: 0,
      waterSourceType: "",
      urbanRural: "Total",
    },
    content: { value: content, type: "text" },
  };
}

function buildServiceSummary(
  service: string,
  records: WashRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];
  const levels = [...new Set(records.map((r) => r.serviceLevel).filter(Boolean))];

  const content = [
    `${service} — WASH Service Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Service levels: ${levels.join(", ")}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${service.toLowerCase()} indicators in the connector.`,
  ].join("\n");

  const id = `summary-service-${service.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${service} — WASH Data Summary`,
      itemUrl: "https://washdata.org/data",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Drinking_water.jpg/48px-Drinking_water.jpg",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO WASH Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${service} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", service],
      recordType: "summary",
      dataSourceUrl: "https://washdata.org/data",
      washService: service,
      serviceLevel: "",
      coveragePercent: 0,
      waterSourceType: "",
      urbanRural: "Total",
    },
    content: { value: content, type: "text" },
  };
}

function buildUrbanRuralSummary(
  records: WashRecord[]
): ExternalItemPayload {
  const urbanRecords = records.filter((r) => r.urbanRural === "Urban");
  const ruralRecords = records.filter((r) => r.urbanRural === "Rural");

  const content = [
    `Urban vs Rural WASH Access — Disparity Summary`,
    ``,
    `Urban records: ${urbanRecords.length}`,
    `Rural records: ${ruralRecords.length}`,
    ``,
    `This summary compares urban and rural WASH access indicators.`,
    `Use urbanRural filter to compare access disparities between settings.`,
  ].join("\n");

  return {
    id: "summary-urban-rural-wash",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Urban vs Rural WASH Access — Disparity Summary",
      itemUrl: "https://washdata.org/data",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Drinking_water.jpg/48px-Drinking_water.jpg",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO WASH Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Urban vs Rural WASH Disparity",
      indicatorValue: `Urban: ${urbanRecords.length}, Rural: ${ruralRecords.length}`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Urban", "Rural", "Disparity"],
      recordType: "summary",
      dataSourceUrl: "https://washdata.org/data",
      washService: "All",
      serviceLevel: "",
      coveragePercent: 0,
      waterSourceType: "",
      urbanRural: "Total",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: WashRecord[]
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
    `Dataset Inventory — NGO WASH Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-wash",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "WASH Connector — Dataset Inventory",
      itemUrl: "https://washdata.org/data",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Drinking_water.jpg/48px-Drinking_water.jpg",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO WASH Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://washdata.org/data",
      washService: "All",
      serviceLevel: "",
      coveragePercent: 0,
      waterSourceType: "",
      urbanRural: "Total",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
