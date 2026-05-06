import type { MultiSectorRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: MultiSectorRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-SDG Summaries ──
  const sdgs = new Set(records.map((r) => r.sdgGoal).filter(Boolean));
  for (const sdg of sdgs) {
    const sdgRecords = records.filter((r) => r.sdgGoal === sdg);
    summaries.push(buildSdgSummary(sdg, sdgRecords));
  }

  // ── Per-Sector Summaries ──
  const sectors = new Set(records.map((r) => r.sectorClassification).filter(Boolean));
  for (const sector of sectors) {
    const sectorRecords = records.filter(
      (r) => r.sectorClassification === sector
    );
    summaries.push(buildSectorSummary(sector, sectorRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: MultiSectorRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));
  const sdgs = new Set(records.map((r) => r.sdgGoal).filter(Boolean));
  const sectors = new Set(records.map((r) => r.sectorClassification).filter(Boolean));

  const content = [
    `Global Cross-Cutting Multi-Sector Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `SDGs covered: ${[...sdgs].join("; ")}`,
    ``,
    `Sectors covered: ${[...sectors].join(", ")}`,
    ``,
    `This summary provides an overview of all cross-cutting multi-sector data`,
    `available in this connector. For specific indicators or countries,`,
    `search by indicator name, country, SDG goal, or sector classification.`,
  ].join("\n");

  return {
    id: "multi-summary-global",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Cross-Cutting Multi-Sector Data Summary",
      itemUrl: "https://data.worldbank.org",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Sustainable_Development_Goals.svg/48px-Sustainable_Development_Goals.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Multi-Sector Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Multi-Sector Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Multi-Sector", "SDG"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org",
      sdgGoal: "All SDGs",
      sdgTarget: "",
      sectorClassification: "All",
      dataFrequency: "Annual",
      dataFormat: "Multiple",
    },
    content: { value: content, type: "text" },
  };
}

function buildSdgSummary(
  sdg: string,
  records: MultiSectorRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];
  const sectors = [...new Set(records.map((r) => r.sectorClassification).filter(Boolean))];

  const content = [
    `${sdg} — Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    `Sectors: ${sectors.join(", ")}`,
    ``,
    `This summary covers all data related to ${sdg} in the connector.`,
  ].join("\n");

  const id = `multi-summary-sdg-${sdg.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 60)}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${sdg} — Multi-Sector Data Summary`,
      itemUrl: "https://data.worldbank.org",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Sustainable_Development_Goals.svg/48px-Sustainable_Development_Goals.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Multi-Sector Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${sdg} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", sdg],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org",
      sdgGoal: sdg,
      sdgTarget: "",
      sectorClassification: sectors.join(", "),
      dataFrequency: "Annual",
      dataFormat: "Multiple",
    },
    content: { value: content, type: "text" },
  };
}

function buildSectorSummary(
  sector: string,
  records: MultiSectorRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];
  const sdgs = [...new Set(records.map((r) => r.sdgGoal).filter(Boolean))];

  const content = [
    `${sector} Sector Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    `Related SDGs: ${sdgs.join("; ")}`,
    ``,
    `This summary covers all ${sector.toLowerCase()} sector data in the connector.`,
  ].join("\n");

  const id = `multi-summary-sector-${sector.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${sector} — Multi-Sector Data Summary`,
      itemUrl: "https://data.worldbank.org",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Sustainable_Development_Goals.svg/48px-Sustainable_Development_Goals.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Multi-Sector Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${sector} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", sector],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org",
      sdgGoal: sdgs.join("; "),
      sdgTarget: "",
      sectorClassification: sector,
      dataFrequency: "Annual",
      dataFormat: "Multiple",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: MultiSectorRecord[]
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
    `Dataset Inventory — NGO Multi-Sector Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "multi-summary-inventory",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Multi-Sector Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Sustainable_Development_Goals.svg/48px-Sustainable_Development_Goals.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Multi-Sector Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org",
      sdgGoal: "",
      sdgTarget: "",
      sectorClassification: "All",
      dataFrequency: "Annual",
      dataFormat: "Multiple",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
