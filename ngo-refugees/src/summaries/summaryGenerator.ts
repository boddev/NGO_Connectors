import type { RefugeeRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: RefugeeRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Displacement-Type Summaries ──
  const types = new Set(records.map((r) => r.displacementType).filter(Boolean));
  for (const dtype of types) {
    const typeRecords = records.filter((r) => r.displacementType === dtype);
    summaries.push(buildDisplacementTypeSummary(dtype, typeRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: RefugeeRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));

  // Find the most recent year's total displaced from UNHCR origin data
  const latestYear = maxYear;
  const originRecords = records.filter(
    (r) =>
      r.sourceOrganization === "UNHCR" &&
      r.year === latestYear &&
      r.recordType === "displacement" &&
      r.countryOfOrigin !== ""
  );
  const totalDisplaced = originRecords.reduce(
    (sum, r) => sum + r.displacedPopulation,
    0
  );

  const content = [
    `Global Refugees, Migration & Displacement Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `Total displaced persons (${latestYear}, UNHCR): ${totalDisplaced.toLocaleString()}`,
    ``,
    `Displacement types covered: ${[...new Set(records.map((r) => r.displacementType).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all refugee, migration, and displacement data`,
    `available in this connector. For specific countries or displacement types,`,
    `search by country of origin, country of asylum, or displacement type.`,
  ].join("\n");

  return {
    id: "summary-global-refugees",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Refugees, Migration & Displacement Data Summary",
      itemUrl: "https://www.unhcr.org/refugee-statistics/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/UNHCR.svg/48px-UNHCR.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Refugees Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Displacement Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Refugees", "Displacement"],
      recordType: "summary",
      dataSourceUrl: "https://www.unhcr.org/refugee-statistics/",
      displacementType: "All",
      populationGroup: "",
      countryOfOrigin: "",
      countryOfAsylum: "",
      displacedPopulation: totalDisplaced,
    },
    content: { value: content, type: "text" },
  };
}

function buildDisplacementTypeSummary(
  displacementType: string,
  records: RefugeeRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${displacementType} Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${displacementType.toLowerCase()} data in the connector.`,
  ].join("\n");

  const id = `summary-type-${displacementType.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${displacementType} — Displacement Data Summary`,
      itemUrl: "https://www.unhcr.org/refugee-statistics/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/UNHCR.svg/48px-UNHCR.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Refugees Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${displacementType} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", displacementType],
      recordType: "summary",
      dataSourceUrl: "https://www.unhcr.org/refugee-statistics/",
      displacementType,
      populationGroup: "",
      countryOfOrigin: "",
      countryOfAsylum: "",
      displacedPopulation: 0,
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: RefugeeRecord[]
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
    `Dataset Inventory — NGO Refugees Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-refugees",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Refugees Connector — Dataset Inventory",
      itemUrl: "https://www.unhcr.org/refugee-statistics/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/UNHCR.svg/48px-UNHCR.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Refugees Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://www.unhcr.org/refugee-statistics/",
      displacementType: "All",
      populationGroup: "",
      countryOfOrigin: "",
      countryOfAsylum: "",
      displacedPopulation: 0,
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
