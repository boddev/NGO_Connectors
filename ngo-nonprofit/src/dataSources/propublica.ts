import type { NonprofitRecord } from "./types.js";

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...(init ?? {}), signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
/**
 * NTEE major category codes with human-readable names.
 * Used to search ProPublica by sector and to tag records.
 */
const NTEE_CATEGORIES: Array<{
  id: number;
  code: string;
  name: string;
}> = [
  { id: 1, code: "A", name: "Arts, Culture & Humanities" },
  { id: 2, code: "B", name: "Education" },
  { id: 3, code: "C-D", name: "Environment & Animals" },
  { id: 4, code: "E-H", name: "Health" },
  { id: 5, code: "I-K", name: "Human Services" },
  { id: 6, code: "L", name: "International & Foreign Affairs" },
  { id: 7, code: "M-N", name: "Public & Societal Benefit" },
  { id: 8, code: "O", name: "Youth Development" },
  { id: 9, code: "P", name: "Human Services" },
  { id: 10, code: "Q", name: "International" },
];

/** US state abbreviation to region mapping */
const US_STATE_REGIONS: Record<string, string> = {
  CT: "Northeast", ME: "Northeast", MA: "Northeast", NH: "Northeast",
  RI: "Northeast", VT: "Northeast", NJ: "Northeast", NY: "Northeast",
  PA: "Northeast", IL: "Midwest", IN: "Midwest", MI: "Midwest",
  OH: "Midwest", WI: "Midwest", IA: "Midwest", KS: "Midwest",
  MN: "Midwest", MO: "Midwest", NE: "Midwest", ND: "Midwest",
  SD: "Midwest", DE: "South", FL: "South", GA: "South",
  MD: "South", NC: "South", SC: "South", VA: "South",
  DC: "South", WV: "South", AL: "South", KY: "South",
  MS: "South", TN: "South", AR: "South", LA: "South",
  OK: "South", TX: "South", AZ: "West", CO: "West",
  ID: "West", MT: "West", NV: "West", NM: "West",
  UT: "West", WY: "West", AK: "West", CA: "West",
  HI: "West", OR: "West", WA: "West",
};

interface ProPublicaSearchResponse {
  total_results: number;
  num_pages: number;
  cur_page: number;
  per_page: number;
  organizations: ProPublicaOrg[];
}

interface ProPublicaOrg {
  ein: number;
  strein: string;
  name: string;
  sub_name: string | null;
  city: string;
  state: string;
  ntee_code: string | null;
  raw_ntee_code: string | null;
  subseccd: number;
  has_subseccd: boolean;
  score: number;
}

interface ProPublicaOrgDetail {
  organization: {
    ein: number;
    name: string;
    city: string;
    state: string;
    ntee_code: string | null;
    subsection_code: number;
    ruling_date: string | null;
    asset_amount: number | null;
    income_amount: number | null;
    revenue_amount: number | null;
    updated_at: string | null;
  };
  filings_with_data: ProPublicaFiling[];
}

interface ProPublicaFiling {
  tax_prd: number;
  tax_prd_yr: number;
  formtype: number;
  totrevenue: number | null;
  totfuncexpns: number | null;
  totassetsend: number | null;
  totliabend: number | null;
  pct_compnsatncurrofcr: number | null;
  totcntrbgfts: number | null;
  totprgmrevnue: number | null;
  compnsatncurrofcr: number | null;
  othrsalwages: number | null;
}

const BASE_URL = "https://projects.propublica.org/nonprofits/api/v2";

/**
 * Fetch nonprofits from ProPublica Nonprofit Explorer API.
 *
 * Strategy: search across major NTEE categories and top states to get
 * a broad cross-section of US nonprofits with filed 990 data.
 * Then fetch org details for the top orgs to get financial filing data.
 */
export async function fetchProPublicaData(): Promise<NonprofitRecord[]> {
  const records: NonprofitRecord[] = [];
  const seenEins = new Set<number>();

  // Search across NTEE categories to get diverse coverage
  for (const cat of NTEE_CATEGORIES) {
    const maxPages = 3; // 25 orgs per page × 3 pages = 75 orgs per category
    for (let page = 0; page < maxPages; page++) {
      const url =
        `${BASE_URL}/search.json?q=&ntee%5Bid%5D=${cat.id}&page=${page}`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(
          `ProPublica search error for NTEE ${cat.code} page ${page}: ${response.status}`
        );
        break;
      }

      const data = (await response.json()) as ProPublicaSearchResponse;
      if (!data.organizations || data.organizations.length === 0) break;

      for (const org of data.organizations) {
        if (seenEins.has(org.ein)) continue;
        seenEins.add(org.ein);

        // Fetch detailed org data including filings
        const detail = await fetchOrgDetail(org.ein);
        if (!detail) continue;

        const latestFiling = detail.filings_with_data?.[0];
        const orgData = detail.organization;

        const revenue = latestFiling?.totrevenue ?? orgData.revenue_amount ?? 0;
        const expenses = latestFiling?.totfuncexpns ?? 0;
        const filingYear = latestFiling?.tax_prd_yr ?? 0;
        const stateRegion = US_STATE_REGIONS[org.state] ?? "";
        const nteeCode = org.ntee_code ?? org.raw_ntee_code ?? "";

        const record: NonprofitRecord = {
          sourceKey: `pp-${org.ein}`,
          title: `${org.name} (EIN: ${org.strein})`,
          country: "United States",
          region: stateRegion,
          year: filingYear,
          indicatorName: "Nonprofit Organization Profile",
          indicatorValue: revenue > 0
            ? `Revenue: $${formatCurrency(revenue)}`
            : "Financial data not available",
          sourceOrganization: "ProPublica",
          datasetName: "ProPublica Nonprofit Explorer",
          dataSourceUrl: `https://projects.propublica.org/nonprofits/organizations/${org.ein}`,
          organizationName: org.name,
          ein: org.strein,
          totalRevenue: revenue,
          totalExpenses: expenses,
          missionStatement: "",
          charityRating: 0,
          tags: buildTags(cat.name, nteeCode, org.state),
          recordType: "organization",
          lastModified: orgData.updated_at ?? new Date().toISOString(),
        };

        // Add filing-level detail as context
        if (latestFiling) {
          record.contextNote = buildFilingContext(latestFiling, orgData);
        }

        records.push(record);

        // Rate-limit: 100ms between detail requests
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    // Rate-limit between category searches
    await new Promise((r) => setTimeout(r, 200));
  }

  return records;
}

async function fetchOrgDetail(
  ein: number
): Promise<ProPublicaOrgDetail | null> {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/organizations/${ein}.json`);
    if (!response.ok) return null;
    return (await response.json()) as ProPublicaOrgDetail;
  } catch {
    return null;
  }
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(amount);
}

function buildTags(
  categoryName: string,
  nteeCode: string,
  state: string
): string[] {
  const tags = ["US Nonprofit", categoryName];
  if (nteeCode) tags.push(`NTEE:${nteeCode}`);
  if (state) tags.push(state);
  return tags;
}

function buildFilingContext(
  filing: ProPublicaFiling,
  org: ProPublicaOrgDetail["organization"]
): string {
  const lines: string[] = [];
  lines.push(`Tax Period Year: ${filing.tax_prd_yr}`);
  if (filing.totrevenue !== null)
    lines.push(`Total Revenue: $${filing.totrevenue.toLocaleString()}`);
  if (filing.totfuncexpns !== null)
    lines.push(`Total Expenses: $${filing.totfuncexpns.toLocaleString()}`);
  if (filing.totassetsend !== null)
    lines.push(`Total Assets: $${filing.totassetsend.toLocaleString()}`);
  if (filing.totliabend !== null)
    lines.push(`Total Liabilities: $${filing.totliabend.toLocaleString()}`);
  if (filing.totcntrbgfts !== null && filing.totcntrbgfts > 0)
    lines.push(
      `Contributions & Grants: $${filing.totcntrbgfts.toLocaleString()}`
    );
  if (filing.totprgmrevnue !== null && filing.totprgmrevnue > 0)
    lines.push(`Program Revenue: $${filing.totprgmrevnue.toLocaleString()}`);
  if (filing.compnsatncurrofcr !== null && filing.compnsatncurrofcr > 0)
    lines.push(
      `Officer Compensation: $${filing.compnsatncurrofcr.toLocaleString()}`
    );
  if (org.ruling_date)
    lines.push(`Tax-Exempt Ruling Date: ${org.ruling_date}`);
  return lines.join(". ");
}

