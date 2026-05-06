import type { ChildProtectionRecord } from "./types.js";

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
// World Bank child protection & welfare indicator codes
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  issue: string;
  ageRange: string;
  domain: string;
}> = [
  {
    code: "SH.DYN.MORT",
    name: "Under-5 mortality rate (per 1,000 live births)",
    unit: "per 1,000 live births",
    issue: "Child Mortality",
    ageRange: "Under 5",
    domain: "Health",
  },
  {
    code: "SP.DYN.IMRT.IN",
    name: "Infant mortality rate (per 1,000 live births)",
    unit: "per 1,000 live births",
    issue: "Child Mortality",
    ageRange: "Under 1",
    domain: "Health",
  },
  {
    code: "SL.TLF.0714.ZS",
    name: "Children in employment, ages 7-14 (% of children)",
    unit: "percentage",
    issue: "Child Labor",
    ageRange: "7-14",
    domain: "Labour",
  },
  {
    code: "SE.PRM.CMPT.ZS",
    name: "Primary completion rate (% of relevant age group)",
    unit: "percentage",
    issue: "Education Access",
    ageRange: "Under 18",
    domain: "Health",
  },
  {
    code: "SP.REG.BRTH.ZS",
    name: "Completeness of birth registration (%)",
    unit: "percentage",
    issue: "Birth Registration",
    ageRange: "Under 5",
    domain: "Registration",
  },
  {
    code: "SH.STA.STNT.ZS",
    name: "Prevalence of stunting (% of children under 5)",
    unit: "percentage",
    issue: "Child Nutrition",
    ageRange: "Under 5",
    domain: "Health",
  },
];

// World Bank region mapping
const WB_REGIONS: Record<string, string> = {
  EAS: "East Asia & Pacific",
  ECS: "Europe & Central Asia",
  LCN: "Latin America & Caribbean",
  MEA: "Middle East & North Africa",
  NAC: "North America",
  SAS: "South Asia",
  SSF: "Sub-Saharan Africa",
};

interface WBApiResponse {
  page: number;
  pages: number;
  per_page: number;
  total: number;
}

interface WBDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  decimal: number;
  region?: { id: string; value: string };
}

/**
 * Fetch all child protection indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<ChildProtectionRecord[]> {
  const records: ChildProtectionRecord[] = [];

  for (const ind of INDICATORS) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url =
        `https://api.worldbank.org/v2/country/all/indicator/${ind.code}` +
        `?format=json&per_page=300&date=2000:2025&page=${page}`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(
          `World Bank API error for ${ind.code} page ${page}: ${response.status}`
        );
        break;
      }

      const json = (await response.json()) as [WBApiResponse, WBDataPoint[]];
      if (!json || !json[1]) break;

      const [meta, data] = json;
      totalPages = meta.pages;

      for (const dp of data) {
        if (dp.value === null || dp.value === undefined) continue;
        // Skip aggregate/regional entries (only real countries have 3-letter ISO codes)
        if (!dp.countryiso3code || dp.countryiso3code.length !== 3) continue;

        const regionId = dp.region?.id ?? "";
        const regionName = WB_REGIONS[regionId] ?? regionId;
        const numValue = typeof dp.value === "number" ? dp.value : parseFloat(String(dp.value));

        records.push({
          sourceKey: `wb-${dp.countryiso3code}-${ind.code}-${dp.date}`,
          title: `${dp.country.value}: ${ind.name} (${dp.date})`,
          country: dp.country.value,
          countryISO3: dp.countryiso3code,
          region: regionName,
          year: parseInt(dp.date, 10),
          indicatorName: ind.name,
          indicatorValue: String(dp.value),
          sourceOrganization: "World Bank",
          datasetName: "World Development Indicators",
          dataSourceUrl: `https://data.worldbank.org/indicator/${ind.code}`,
          childProtectionIssue: ind.issue,
          ageRange: ind.ageRange,
          prevalenceRate: isNaN(numValue) ? 0 : numValue,
          legalProtection: false,
          childWelfareDomain: ind.domain,
          tags: [ind.domain, ind.issue, "World Bank", ind.code],
          recordType: "indicator",
          lastModified: new Date().toISOString(),
        });
      }

      page++;
    }

    // Rate-limit courtesy: 200ms between indicator requests
    await new Promise((r) => setTimeout(r, 200));
  }

  return records;
}

