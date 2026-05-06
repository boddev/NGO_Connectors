import type { AgricultureRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: AgricultureRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Domain Summaries ──
  const domains = new Set(records.map((r) => r.agriculturalDomain).filter(Boolean));
  for (const domain of domains) {
    const domainRecords = records.filter(
      (r) => r.agriculturalDomain === domain
    );
    summaries.push(buildDomainSummary(domain, domainRecords));
  }

  // ── Per-Crop Summaries ──
  const crops = new Set(records.map((r) => r.cropOrCommodity).filter(Boolean));
  for (const crop of crops) {
    const cropRecords = records.filter((r) => r.cropOrCommodity === crop);
    summaries.push(buildCropSummary(crop, cropRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: AgricultureRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));

  const content = [
    `Global Agriculture & Food Security Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `Domains covered: ${[...new Set(records.map((r) => r.agriculturalDomain).filter(Boolean))].join(", ")}`,
    `Crops/Commodities: ${[...new Set(records.map((r) => r.cropOrCommodity).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all agriculture and food security data`,
    `available in this connector. For specific indicators or countries,`,
    `search by indicator name, country, crop, or agricultural domain.`,
  ].join("\n");

  return {
    id: "summary-global-agriculture",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Agriculture & Food Security Data Summary",
      itemUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/FAO_logo.svg/48px-FAO_logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Agriculture Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Agriculture Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Agriculture"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      agriculturalDomain: "All",
      cropOrCommodity: "",
      foodSecurityPhase: "",
      productionVolume: 0,
      tradeFlow: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDomainSummary(
  domain: string,
  records: AgricultureRecord[]
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
    `This summary covers all ${domain.toLowerCase()} indicators in the agriculture connector.`,
  ].join("\n");

  const id = `summary-domain-${domain.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${domain} — Agriculture Data Summary`,
      itemUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/FAO_logo.svg/48px-FAO_logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Agriculture Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${domain} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", domain],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      agriculturalDomain: domain,
      cropOrCommodity: "",
      foodSecurityPhase: "",
      productionVolume: 0,
      tradeFlow: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildCropSummary(
  crop: string,
  records: AgricultureRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;

  const content = [
    `${crop} — Crop/Commodity Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Year range: ${minYear}–${maxYear}`,
    ``,
    `This summary covers all data for ${crop} in the agriculture connector.`,
  ].join("\n");

  const id = `summary-crop-${crop.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${crop} — Agriculture Data Summary`,
      itemUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/FAO_logo.svg/48px-FAO_logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Agriculture Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: `${crop} Summary`,
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", crop, "Crop"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      agriculturalDomain: "Production",
      cropOrCommodity: crop,
      foodSecurityPhase: "",
      productionVolume: 0,
      tradeFlow: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: AgricultureRecord[]
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
    `Dataset Inventory — NGO Agriculture Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-agriculture",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Agriculture Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/FAO_logo.svg/48px-FAO_logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Agriculture Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/agriculture-and-rural-development",
      agriculturalDomain: "All",
      cropOrCommodity: "",
      foodSecurityPhase: "",
      productionVolume: 0,
      tradeFlow: "",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
