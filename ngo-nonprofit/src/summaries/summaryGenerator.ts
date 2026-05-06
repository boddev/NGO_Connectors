import type { NonprofitRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: NonprofitRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Source Summaries ──
  const sources = new Set(records.map((r) => r.sourceOrganization).filter(Boolean));
  for (const source of sources) {
    const sourceRecords = records.filter(
      (r) => r.sourceOrganization === source
    );
    summaries.push(buildSourceSummary(source, sourceRecords));
  }

  // ── Per-Country Summaries ──
  const countries = new Set(records.map((r) => r.country).filter(Boolean));
  for (const country of countries) {
    const countryRecords = records.filter((r) => r.country === country);
    summaries.push(buildCountrySummary(country, countryRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  // ── Top Nonprofits by Revenue ──
  summaries.push(buildTopRevenuesSummary(records));

  return summaries;
}

function buildGlobalSummary(records: NonprofitRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const organizations = new Set(records.map((r) => r.organizationName));
  const sources = new Set(records.map((r) => r.sourceOrganization));

  const totalRevenue = records.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
  const totalExpenses = records.reduce((sum, r) => sum + (r.totalExpenses || 0), 0);

  const content = [
    `Global Nonprofit Sector & Charity Operations Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Organizations covered: ${organizations.size}`,
    `Countries: ${[...countries].join(", ")}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `Aggregate Financial Data:`,
    `Combined Revenue: $${totalRevenue.toLocaleString()}`,
    `Combined Expenses: $${totalExpenses.toLocaleString()}`,
    ``,
    `This summary provides an overview of all nonprofit and charity data`,
    `available in this connector. For specific organizations or sectors,`,
    `search by organization name, EIN, NTEE code, or country.`,
  ].join("\n");

  return {
    id: "summary-global-nonprofit",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Nonprofit Sector & Charity Operations Summary",
      itemUrl: "https://projects.propublica.org/nonprofits/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Symbol_thumbs_up.svg/48px-Symbol_thumbs_up.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Nonprofit Connector",
      country: "Global",
      region: "Global",
      year: new Date().getFullYear(),
      indicatorName: "Nonprofit Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Nonprofit"],
      recordType: "summary",
      dataSourceUrl: "https://projects.propublica.org/nonprofits/",
      organizationName: "Multiple Organizations",
      ein: "",
      totalRevenue: totalRevenue,
      totalExpenses: totalExpenses,
      missionStatement: "",
      charityRating: 0,
    },
    content: { value: content, type: "text" },
  };
}

function buildSourceSummary(
  source: string,
  records: NonprofitRecord[]
): ExternalItemPayload {
  const organizations = new Set(records.map((r) => r.organizationName));
  const totalRevenue = records.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);

  const content = [
    `${source} — Nonprofit Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Organizations: ${organizations.size}`,
    `Combined Revenue: $${totalRevenue.toLocaleString()}`,
    ``,
    `This summary covers all nonprofit data from ${source} in the connector.`,
  ].join("\n");

  const id = `summary-source-${source.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${source} — Nonprofit Data Summary`,
      itemUrl: "https://projects.propublica.org/nonprofits/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Symbol_thumbs_up.svg/48px-Symbol_thumbs_up.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: source,
      datasetName: "NGO Nonprofit Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${source} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", source],
      recordType: "summary",
      dataSourceUrl: "https://projects.propublica.org/nonprofits/",
      organizationName: "Multiple Organizations",
      ein: "",
      totalRevenue: totalRevenue,
      totalExpenses: 0,
      missionStatement: "",
      charityRating: 0,
    },
    content: { value: content, type: "text" },
  };
}

function buildCountrySummary(
  country: string,
  records: NonprofitRecord[]
): ExternalItemPayload {
  const organizations = new Set(records.map((r) => r.organizationName));
  const totalRevenue = records.reduce((sum, r) => sum + (r.totalRevenue || 0), 0);
  const regions = [...new Set(records.map((r) => r.region).filter(Boolean))];

  const content = [
    `${country} — Nonprofit Sector Summary`,
    ``,
    `Total records: ${records.length}`,
    `Organizations: ${organizations.size}`,
    `Regions: ${regions.join(", ") || "N/A"}`,
    `Combined Revenue: $${totalRevenue.toLocaleString()}`,
    ``,
    `This summary covers all nonprofit data for ${country} in the connector.`,
  ].join("\n");

  const id = `summary-country-${country.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${country} — Nonprofit Sector Summary`,
      itemUrl: "https://projects.propublica.org/nonprofits/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Symbol_thumbs_up.svg/48px-Symbol_thumbs_up.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Nonprofit Connector",
      country,
      region: regions[0] ?? "",
      year: 0,
      indicatorName: `${country} Nonprofit Summary`,
      indicatorValue: `${organizations.size} organizations`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", country],
      recordType: "summary",
      dataSourceUrl: "https://projects.propublica.org/nonprofits/",
      organizationName: "Multiple Organizations",
      ein: "",
      totalRevenue: totalRevenue,
      totalExpenses: 0,
      missionStatement: "",
      charityRating: 0,
    },
    content: { value: content, type: "text" },
  };
}

function buildTopRevenuesSummary(
  records: NonprofitRecord[]
): ExternalItemPayload {
  const sorted = [...records]
    .filter((r) => r.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 20);

  const lines = [
    `Top Nonprofits by Revenue`,
    ``,
    `Top ${sorted.length} organizations by total revenue:`,
    ``,
  ];

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    lines.push(
      `${i + 1}. ${r.organizationName} (${r.ein || "N/A"}): $${r.totalRevenue.toLocaleString()} — ${r.country}`
    );
  }

  return {
    id: "summary-top-revenue-nonprofit",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Top Nonprofits by Revenue",
      itemUrl: "https://projects.propublica.org/nonprofits/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Symbol_thumbs_up.svg/48px-Symbol_thumbs_up.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Nonprofit Connector",
      country: "Global",
      region: "Global",
      year: new Date().getFullYear(),
      indicatorName: "Top Revenue Rankings",
      indicatorValue: `Top ${sorted.length} nonprofits`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Revenue", "Rankings"],
      recordType: "summary",
      dataSourceUrl: "https://projects.propublica.org/nonprofits/",
      organizationName: "Multiple Organizations",
      ein: "",
      totalRevenue: 0,
      totalExpenses: 0,
      missionStatement: "",
      charityRating: 0,
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}

function buildDatasetInventory(
  records: NonprofitRecord[]
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
    `Dataset Inventory — NGO Nonprofit Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-nonprofit",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Nonprofit Connector — Dataset Inventory",
      itemUrl: "https://projects.propublica.org/nonprofits/",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Symbol_thumbs_up.svg/48px-Symbol_thumbs_up.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Nonprofit Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://projects.propublica.org/nonprofits/",
      organizationName: "Multiple Organizations",
      ein: "",
      totalRevenue: 0,
      totalExpenses: 0,
      missionStatement: "",
      charityRating: 0,
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
