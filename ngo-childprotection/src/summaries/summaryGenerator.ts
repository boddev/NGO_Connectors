import type { ChildProtectionRecord, ExternalItemPayload } from "../dataSources/types.js";

/**
 * Generate pre-computed summary items to handle Copilot aggregation limitations.
 * Copilot cannot reliably count, sum, or average across items — summaries provide
 * pre-calculated answers for common aggregate questions.
 */
export function generateSummaryItems(
  records: ChildProtectionRecord[]
): ExternalItemPayload[] {
  const summaries: ExternalItemPayload[] = [];

  // ── Global Summary ──
  summaries.push(buildGlobalSummary(records));

  // ── Per-Domain Summaries ──
  const domains = new Set(records.map((r) => r.childWelfareDomain).filter(Boolean));
  for (const domain of domains) {
    const domainRecords = records.filter(
      (r) => r.childWelfareDomain === domain
    );
    summaries.push(buildDomainSummary(domain, domainRecords));
  }

  // ── Per-Issue Summaries ──
  const issues = new Set(records.map((r) => r.childProtectionIssue).filter(Boolean));
  for (const issue of issues) {
    const issueRecords = records.filter(
      (r) => r.childProtectionIssue === issue
    );
    summaries.push(buildIssueSummary(issue, issueRecords));
  }

  // ── Dataset Inventory Summary ──
  summaries.push(buildDatasetInventory(records));

  return summaries;
}

function buildGlobalSummary(records: ChildProtectionRecord[]): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = new Set(records.map((r) => r.indicatorName));
  const years = records.map((r) => r.year).filter((y) => y > 0);
  const minYear = years.length ? Math.min(...years) : 0;
  const maxYear = years.length ? Math.max(...years) : 0;
  const sources = new Set(records.map((r) => r.sourceOrganization));
  const issues = new Set(records.map((r) => r.childProtectionIssue).filter(Boolean));

  const content = [
    `Global Child Protection & Welfare Data Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries covered: ${countries.size}`,
    `Unique indicators: ${indicators.size}`,
    `Year range: ${minYear}–${maxYear}`,
    `Data sources: ${[...sources].join(", ")}`,
    ``,
    `Child protection issues covered: ${[...issues].join(", ")}`,
    `Welfare domains: ${[...new Set(records.map((r) => r.childWelfareDomain).filter(Boolean))].join(", ")}`,
    ``,
    `This summary provides an overview of all child protection and welfare data`,
    `available in this connector. For specific indicators or countries,`,
    `search by indicator name, country, child protection issue, or welfare domain.`,
  ].join("\n");

  return {
    id: "summary-global-childprotection",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Global Child Protection & Welfare Data Summary",
      itemUrl: "https://data.worldbank.org/topic/health",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/UNICEF_Logo.svg/48px-UNICEF_Logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Child Protection Connector",
      country: "Global",
      region: "Global",
      year: maxYear,
      indicatorName: "Child Protection Data Summary",
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Global", "Child Protection"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/health",
      childProtectionIssue: "All",
      ageRange: "",
      prevalenceRate: 0,
      legalProtection: false,
      childWelfareDomain: "All",
    },
    content: { value: content, type: "text" },
  };
}

function buildDomainSummary(
  domain: string,
  records: ChildProtectionRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];

  const content = [
    `${domain} Domain Summary — Child Protection & Welfare`,
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
      title: `${domain} — Child Protection Data Summary`,
      itemUrl: "https://data.worldbank.org/topic/health",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/UNICEF_Logo.svg/48px-UNICEF_Logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Child Protection Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${domain} Summary`,
      indicatorValue: `${records.length} records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", domain],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/health",
      childProtectionIssue: "",
      ageRange: "",
      prevalenceRate: 0,
      legalProtection: false,
      childWelfareDomain: domain,
    },
    content: { value: content, type: "text" },
  };
}

function buildIssueSummary(
  issue: string,
  records: ChildProtectionRecord[]
): ExternalItemPayload {
  const countries = new Set(records.map((r) => r.country));
  const indicators = [...new Set(records.map((r) => r.indicatorName))];
  const ageRanges = [...new Set(records.map((r) => r.ageRange).filter(Boolean))];

  const content = [
    `${issue} — Child Protection Issue Summary`,
    ``,
    `Total records: ${records.length}`,
    `Countries: ${countries.size}`,
    `Age ranges covered: ${ageRanges.join(", ")}`,
    `Indicators: ${indicators.join("; ")}`,
    ``,
    `This summary covers all ${issue.toLowerCase()} data in the connector.`,
  ].join("\n");

  const id = `summary-issue-${issue.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

  return {
    id,
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: `${issue} — Child Protection Issue Summary`,
      itemUrl: "https://data.worldbank.org/topic/health",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/UNICEF_Logo.svg/48px-UNICEF_Logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Child Protection Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: `${issue} Summary`,
      indicatorValue: `${records.length} records across ${countries.size} countries`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", issue],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/health",
      childProtectionIssue: issue,
      ageRange: ageRanges.join(", "),
      prevalenceRate: 0,
      legalProtection: false,
      childWelfareDomain: "",
    },
    content: { value: content, type: "text" },
  };
}

function buildDatasetInventory(
  records: ChildProtectionRecord[]
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
    `Dataset Inventory — NGO Child Protection Connector`,
    ``,
    `Total datasets: ${datasets.size}`,
    `Total records: ${records.length}`,
    ``,
  ];

  for (const [name, info] of datasets) {
    lines.push(`• ${name} (${info.org}): ${info.count} records`);
  }

  return {
    id: "summary-inventory-childprotection",
    acl: [{ type: "everyone", value: "everyone", accessType: "grant" }],
    properties: {
      title: "Child Protection Connector — Dataset Inventory",
      itemUrl: "https://data.worldbank.org/topic/health",
      iconUrl:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/UNICEF_Logo.svg/48px-UNICEF_Logo.svg.png",
      lastModified: new Date().toISOString(),
      sourceOrganization: "Multiple Sources",
      datasetName: "NGO Child Protection Connector",
      country: "Global",
      region: "Global",
      year: 0,
      indicatorName: "Dataset Inventory",
      indicatorValue: `${datasets.size} datasets, ${records.length} total records`,
      "tags@odata.type": "Collection(Edm.String)",
      tags: ["Summary", "Inventory"],
      recordType: "summary",
      dataSourceUrl: "https://data.worldbank.org/topic/health",
      childProtectionIssue: "",
      ageRange: "",
      prevalenceRate: 0,
      legalProtection: false,
      childWelfareDomain: "All",
    },
    content: { value: lines.join("\n"), type: "text" },
  };
}
