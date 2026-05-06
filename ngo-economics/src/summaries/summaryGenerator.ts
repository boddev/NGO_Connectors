import type { EconomicsRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: EconomicsRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Category Summaries ──
  const categories = new Set(records.map((r) => r.economicIndicator).filter(Boolean));
  for (const category of categories) {
    const categoryRecords = records.filter(
      (r) => r.economicIndicator === category
    );
    summaries.push(buildCategorySummary(category, categoryRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: EconomicsRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));

  const content = [
    `Global Economic Development & Finance Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `Economic categories covered: ${[...new Set(records.map((r) => r.economicIndicator).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all economic development and finance data`,
    `available in this connector. For specific indicators or countries,`,
    `search by indicator name, country, or economic category.`,
  ].join("\n");

  return {
    id: "summary-global-economics",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Economic Development & Finance Data Summary",
      itemUrl: "https://data.worldbank.org/topic/economy-and-growth",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Economics Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Economic Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Economics"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/economy-and-growth",
      economicIndicator: "All",
      gdpValue: 0,
      giniCoefficient: 0,
      incomeGroup: "",
      developmentCategory: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildCategorySummary(
  category: string,
  records: EconomicsRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${category} Category Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${category.toLowerCase()} indicators in the connector.`,
  ].join("\n");

  const id = `summary-category-${category.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${category} — Economic Data Summary`,
      itemUrl: "https://data.worldbank.org/topic/economy-and-growth",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Economics Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${category} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", category],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/economy-and-growth",
      economicIndicator: category,
      gdpValue: 0,
      giniCoefficient: 0,
      incomeGroup: "",
      developmentCategory: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: EconomicsRecord[]
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
    `Dataset Inventory — NGO Economics Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-economics",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Economics Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org/topic/economy-and-growth",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Economics Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/economy-and-growth",
      economicIndicator: "All",
      gdpValue: 0,
      giniCoefficient: 0,
      incomeGroup: "",
      developmentCategory: "",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
