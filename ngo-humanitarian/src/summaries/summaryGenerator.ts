import type { HumanitarianRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: HumanitarianRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Crisis-Type Summaries ──
  const crisisTypes = new Set(
    records.map((r) => r.crisisType).filter(Boolean)
  );
  for (const crisisType of crisisTypes) {
    const crisisRecords = records.filter((r) => r.crisisType === crisisType);
    summaries.push(buildCrisisTypeSummary(crisisType, crisisRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(
  records: HumanitarianRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country).filter(Boolean));
  const crisisTypes = new Set(records.map((r) => r.crisisType).filter(Boolean));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));
  const totalAffected = records.reduce(
    (sum, r) => sum + (r.affectedPopulation ?? 0),
    0
  );
  const activeCount = records.filter(
    (r) => r.emergencyStatus === "Active"
  ).length;

  const content = [
    `Global Humanitarian Aid & Disaster Relief Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Crisis types tracked: ${[...crisisTypes].join(", ")}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    `Total affected population (reported): ${totalAffected.toLocaleString()}`,
    `Active emergencies: ${activeCount}`,
    ``,
    `This summary provides an overview of all humanitarian aid and disaster`,
    `relief data available in this connector. For specific crises, countries,`,
    `or organizations, search by crisis type, country, or response organization.`,
  ].join("\n");

  return {
    id: "summary-global-humanitarian",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Humanitarian Aid & Disaster Relief Data Summary",
      itemUrl: "https://reliefweb.int",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Symbol_humanitarian_aid.svg/48px-Symbol_humanitarian_aid.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Humanitarian Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Humanitarian Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Humanitarian"],
      recordType: "summary",
      dataSourceUrl: "https://reliefweb.int",
      crisisType: "",
      emergencyStatus: "",
      affectedPopulation: totalAffected,
      responseOrganization: "",
      humanitarianSector: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildCrisisTypeSummary(
  crisisType: string,
  records: HumanitarianRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country).filter(Boolean));
  const totalAffected = records.reduce(
    (sum, r) => sum + (r.affectedPopulation ?? 0),
    0
  );
  const responders = [
    ...new Set(records.map((r) => r.responseOrganization).filter(Boolean)),
  ];

  const content = [
    `${crisisType} Crisis Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries affected: ${countries.size}`,
    `Reported affected population: ${totalAffected.toLocaleString()}`,
    `Response organizations: ${responders.slice(0, 10).join(", ")}`,
    ``,
    `This summary covers all ${crisisType.toLowerCase()} crisis data in the connector.`,
  ].join("\n");

  const id = `summary-crisis-${crisisType.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${crisisType} — Humanitarian Crisis Summary`,
      itemUrl: "https://reliefweb.int",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Symbol_humanitarian_aid.svg/48px-Symbol_humanitarian_aid.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Humanitarian Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${crisisType} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", crisisType],
      recordType: "summary",
      dataSourceUrl: "https://reliefweb.int",
      crisisType,
      emergencyStatus: "",
      affectedPopulation: totalAffected,
      responseOrganization: "",
      humanitarianSector: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: HumanitarianRecord[]
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
    `Dataset Inventory — NGO Humanitarian Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-humanitarian",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Humanitarian Connector — Dataset Inventory",
      itemUrl: "https://reliefweb.int",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Symbol_humanitarian_aid.svg/48px-Symbol_humanitarian_aid.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Humanitarian Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://reliefweb.int",
      crisisType: "",
      emergencyStatus: "",
      affectedPopulation: 0,
      responseOrganization: "",
      humanitarianSector: "",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
