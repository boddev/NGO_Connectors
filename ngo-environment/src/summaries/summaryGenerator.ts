import type { EnvironmentRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: EnvironmentRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Domain Summaries ──
  const domains = new Set(records.map((r) => r.environmentalDomain).filter(Boolean));
  for (const domain of domains) {
    const domainRecords = records.filter(
      (r) => r.environmentalDomain === domain
    );
    summaries.push(buildDomainSummary(domain, domainRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: EnvironmentRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));

  const content = [
    `Global Environment & Climate Change Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `Domains covered: ${[...new Set(records.map((r) => r.environmentalDomain).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all environmental and climate data`,
    `available in this connector. For specific indicators or countries,`,
    `search by indicator name, country, or environmental domain.`,
  ].join("\n");

  return {
    id: "summary-global-environment",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Environment & Climate Change Data Summary",
      itemUrl: "https://data.worldbank.org/topic/climate-change",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Nuvola_apps_kcoloredit.svg/48px-Nuvola_apps_kcoloredit.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Environment Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Environmental Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Environment"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/climate-change",
      environmentalDomain: "All",
      emissionType: "",
      speciesName: "",
      conservationStatus: "",
      measureUnit: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDomainSummary(
  domain: string,
  records: EnvironmentRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${domain} Domain Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${domain.toLowerCase()} indicators in the connector.`,
  ].join("\n");

  const id = `summary-domain-${domain.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${domain} — Environment Data Summary`,
      itemUrl: "https://data.worldbank.org/topic/climate-change",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Nuvola_apps_kcoloredit.svg/48px-Nuvola_apps_kcoloredit.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Environment Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${domain} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", domain],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/climate-change",
      environmentalDomain: domain,
      emissionType: "",
      speciesName: "",
      conservationStatus: "",
      measureUnit: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: EnvironmentRecord[]
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
    `Dataset Inventory — NGO Environment Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-environment",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Environment Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org/topic/climate-change",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Nuvola_apps_kcoloredit.svg/48px-Nuvola_apps_kcoloredit.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Environment Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/climate-change",
      environmentalDomain: "All",
      emissionType: "",
      speciesName: "",
      conservationStatus: "",
      measureUnit: "",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
