import type { AidFundingRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: AidFundingRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Donor Summaries ──
  const donors = new Set(
    records.map((r) => r.donorOrganization).filter(Boolean)
  );
  for (const donor of donors) {
    const donorRecords = records.filter(
      (r) => r.donorOrganization === donor
    );
    if (donorRecords.length >= 5) {
      summaries.push(buildDonorSummary(donor, donorRecords));
    }
  }

  // ── Per-Region Summaries ──
  const regions = new Set(records.map((r) => r.region).filter(Boolean));
  for (const region of regions) {
    const regionRecords = records.filter((r) => r.region === region);
    summaries.push(buildRegionSummary(region, regionRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: AidFundingRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));
  const donors = new Set(
    records.map((r) => r.donorOrganization).filter(Boolean)
  );

  const content = [
    `Global Aid Transparency & Funding Flows Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    `Donor organizations tracked: ${donors.size}`,
    ``,
    `Record types: ${[...new Set(records.map((r) => r.recordType))].join(", ")}`,
    ``,
    `This summary provides an overview of all aid transparency and funding`,
    `flow data available in this connector. For specific indicators, countries,`,
    `or donors, search by indicator name, country, donor, or aid sector.`,
  ].join("\n");

  return {
    id: "summary-global-aidfunding",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Aid Transparency & Funding Flows Data Summary",
      itemUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Aid Funding Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Aid Funding Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Aid Funding"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      donorOrganization: "",
      recipientCountry: "",
      aidSector: "All",
      disbursementAmount: 0,
      aidType: "",
      currency: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDonorSummary(
  donor: string,
  records: AidFundingRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.recipientCountry).filter(Boolean));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${donor} — Aid Funding Summary`,
    ``,
    `Total records: ${records.length}`,
    `Recipient countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all data related to ${donor} in the connector.`,
  ].join("\n");

  const id = `summary-donor-${donor.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 100)}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${donor} — Aid Funding Summary`,
      itemUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Aid Funding Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${donor} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Donor", donor],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      donorOrganization: donor,
      recipientCountry: "",
      aidSector: "All",
      disbursementAmount: 0,
      aidType: "",
      currency: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildRegionSummary(
  region: string,
  records: AidFundingRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${region} — Aid Funding Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all aid funding data for the ${region} region.`,
  ].join("\n");

  const id = `summary-region-${region.toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 100)}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${region} — Aid Funding Summary`,
      itemUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Aid Funding Connector",
      country: "Global",
      region,
      year: 0,
      indicatorName: `${region} Aid Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Region", region],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      donorOrganization: "",
      recipientCountry: "",
      aidSector: "All",
      disbursementAmount: 0,
      aidType: "",
      currency: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: AidFundingRecord[]
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
    `Dataset Inventory — NGO Aid Funding Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-aidfunding",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Aid Funding Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Globe_icon_2.svg/48px-Globe_icon_2.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Aid Funding Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/aid-effectiveness",
      donorOrganization: "",
      recipientCountry: "",
      aidSector: "All",
      disbursementAmount: 0,
      aidType: "",
      currency: "",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
