import type { EnergyRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: EnergyRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Energy-Source Summaries ──
  const sources = new Set(records.map((r) => r.energySource).filter(Boolean));
  for (const source of sources) {
    const sourceRecords = records.filter((r) => r.energySource === source);
    summaries.push(buildEnergySourceSummary(source, sourceRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: EnergyRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const dataSources = new Set(records.map((r) => r.sourceOrganization));

  // Compute average electrification rate from latest year data
  const electrificationRecords = records.filter(
    (r) => r.electrificationRate !== null && r.year === maxYear
  );
  const avgElectrification = electrificationRecords.length
    ? electrificationRecords.reduce((sum, r) => sum + (r.electrificationRate ?? 0), 0) /
      electrificationRecords.length
    : 0;

  const content = [
    `Global Energy & Infrastructure Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...dataSources].join(", ")}`,
    ``,
    `Average electrification rate (${maxYear}): ${avgElectrification.toFixed(1)}%`,
    `Energy sources tracked: ${[...new Set(records.map((r) => r.energySource).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all energy and infrastructure data`,
    `available in this connector. For specific indicators or countries,`,
    `search by indicator name, country, or energy source.`,
  ].join("\n");

  return {
    id: "summary-global-energy",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Energy & Infrastructure Data Summary",
      itemUrl: "https://data.worldbank.org/topic/energy-and-mining",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Nuvola_apps_important_yellow.svg/48px-Nuvola_apps_important_yellow.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Energy Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Energy Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Energy"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/energy-and-mining",
      energySource: "",
      accessRate: null,
      capacityMW: null,
      infrastructureType: "",
      electrificationRate: null,
    },
    content: { value: content, type: "text" },
  };
}

function buildEnergySourceSummary(
  energySource: string,
  records: EnergyRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${energySource} Energy Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${energySource.toLowerCase()} energy indicators in the connector.`,
  ].join("\n");

  const id = `summary-energy-${energySource.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${energySource} — Energy Data Summary`,
      itemUrl: "https://data.worldbank.org/topic/energy-and-mining",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Nuvola_apps_important_yellow.svg/48px-Nuvola_apps_important_yellow.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Energy Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${energySource} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", energySource],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/energy-and-mining",
      energySource,
      accessRate: null,
      capacityMW: null,
      infrastructureType: "",
      electrificationRate: null,
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: EnergyRecord[]
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
    `Dataset Inventory — NGO Energy Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-energy",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Energy Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org/topic/energy-and-mining",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Nuvola_apps_important_yellow.svg/48px-Nuvola_apps_important_yellow.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Energy Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/energy-and-mining",
      energySource: "",
      accessRate: null,
      capacityMW: null,
      infrastructureType: "",
      electrificationRate: null,
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
