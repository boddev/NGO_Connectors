import type { EducationRecord } from "./types.js";

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
// World Bank education indicator codes with metadata
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  domain: string;
  level: string;
  enrollmentType: string;
}> = [
  {
    code: "SE.PRM.ENRR",
    name: "Gross enrollment ratio, primary (% gross)",
    unit: "percentage",
    domain: "Access",
    level: "Primary",
    enrollmentType: "Gross enrollment",
  },
  {
    code: "SE.SEC.ENRR",
    name: "Gross enrollment ratio, secondary (% gross)",
    unit: "percentage",
    domain: "Access",
    level: "Secondary",
    enrollmentType: "Gross enrollment",
  },
  {
    code: "SE.TER.ENRR",
    name: "Gross enrollment ratio, tertiary (% gross)",
    unit: "percentage",
    domain: "Access",
    level: "Tertiary",
    enrollmentType: "Gross enrollment",
  },
  {
    code: "SE.PRE.ENRR",
    name: "Gross enrollment ratio, pre-primary (% gross)",
    unit: "percentage",
    domain: "Early Childhood",
    level: "Pre-primary",
    enrollmentType: "Gross enrollment",
  },
  {
    code: "SE.PRM.CMPT.ZS",
    name: "Primary completion rate (% of relevant age group)",
    unit: "percentage",
    domain: "Access",
    level: "Primary",
    enrollmentType: "",
  },
  {
    code: "SE.ADT.LITR.ZS",
    name: "Literacy rate, adult total (% of people ages 15 and above)",
    unit: "percentage",
    domain: "Literacy",
    level: "",
    enrollmentType: "",
  },
  {
    code: "SE.ADT.1524.LT.ZS",
    name: "Literacy rate, youth total (% of people ages 15-24)",
    unit: "percentage",
    domain: "Literacy",
    level: "",
    enrollmentType: "",
  },
  {
    code: "SE.XPD.TOTL.GD.ZS",
    name: "Government expenditure on education, total (% of GDP)",
    unit: "percentage",
    domain: "Financing",
    level: "",
    enrollmentType: "",
  },
  {
    code: "SE.XPD.TOTL.GB.ZS",
    name: "Government expenditure on education (% of government expenditure)",
    unit: "percentage",
    domain: "Financing",
    level: "",
    enrollmentType: "",
  },
  {
    code: "SE.COM.DURS",
    name: "Compulsory education, duration (years)",
    unit: "years",
    domain: "Access",
    level: "",
    enrollmentType: "",
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
 * Fetch all education indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<EducationRecord[]> {
  const records: EducationRecord[] = [];

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

        const isLiteracy = ind.domain === "Literacy";

        records.push({
          sourceKey: `wb-${dp.countryiso3code}-${ind.code}-${dp.date}`,
          title: `${dp.country.value}: ${ind.name} (${dp.date})`,
          country: dp.country.value,
          countryISO3: dp.countryiso3code,
          region: regionName,
          year: parseInt(dp.date, 10),
          indicatorName: ind.name,
          indicatorValue: String(dp.value),
          measureUnit: ind.unit,
          sourceOrganization: "World Bank",
          datasetName: "World Development Indicators",
          dataSourceUrl: `https://data.worldbank.org/indicator/${ind.code}`,
          educationLevel: ind.level,
          enrollmentType: ind.enrollmentType,
          genderParity: 0,
          literacyRate: isLiteracy ? dp.value : 0,
          educationDomain: ind.domain,
          tags: [ind.domain, "World Bank", ind.code],
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

