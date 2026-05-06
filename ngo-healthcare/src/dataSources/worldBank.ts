import type { HealthRecord } from "./types.js";

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
// World Bank health indicator codes — all verified working against the API
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  domain: string;
  disease: string;
  ageGroup: string;
}> = [
  {
    code: "SH.DYN.MORT",
    name: "Under-5 mortality rate (per 1,000 live births)",
    unit: "per 1,000 live births",
    domain: "Child Health",
    disease: "All causes",
    ageGroup: "Under 5",
  },
  {
    code: "SH.DYN.NMRT",
    name: "Neonatal mortality rate (per 1,000 live births)",
    unit: "per 1,000 live births",
    domain: "Child Health",
    disease: "All causes",
    ageGroup: "Neonatal",
  },
  {
    code: "SH.STA.MMRT",
    name: "Maternal mortality ratio (per 100,000 live births)",
    unit: "per 100,000 live births",
    domain: "Maternal Health",
    disease: "Maternal conditions",
    ageGroup: "15-49",
  },
  {
    code: "SP.DYN.LE00.IN",
    name: "Life expectancy at birth (years)",
    unit: "years",
    domain: "Mortality",
    disease: "All causes",
    ageGroup: "All ages",
  },
  {
    code: "SH.IMM.MEAS",
    name: "Measles immunization coverage (% of children 12-23 months)",
    unit: "percentage",
    domain: "Immunization",
    disease: "Measles",
    ageGroup: "12-23 months",
  },
  {
    code: "SH.IMM.IDPT",
    name: "DPT immunization coverage (% of children 12-23 months)",
    unit: "percentage",
    domain: "Immunization",
    disease: "Diphtheria/Pertussis/Tetanus",
    ageGroup: "12-23 months",
  },
  {
    code: "SH.TBS.INCD",
    name: "Tuberculosis incidence (per 100,000 population)",
    unit: "per 100,000 population",
    domain: "Communicable Diseases",
    disease: "Tuberculosis",
    ageGroup: "All ages",
  },
  {
    code: "SH.HIV.INCD.TL.P3",
    name: "HIV incidence (per 1,000 uninfected population)",
    unit: "per 1,000 uninfected population",
    domain: "Communicable Diseases",
    disease: "HIV/AIDS",
    ageGroup: "15-49",
  },
  {
    code: "SH.XPD.CHEX.PC.CD",
    name: "Current health expenditure per capita (current US$)",
    unit: "current US$",
    domain: "Health Financing",
    disease: "",
    ageGroup: "All ages",
  },
  {
    code: "SH.XPD.CHEX.GD.ZS",
    name: "Current health expenditure (% of GDP)",
    unit: "percentage of GDP",
    domain: "Health Financing",
    disease: "",
    ageGroup: "All ages",
  },
  {
    code: "SH.MED.PHYS.ZS",
    name: "Physicians (per 1,000 people)",
    unit: "per 1,000 people",
    domain: "Health Systems",
    disease: "",
    ageGroup: "All ages",
  },
  {
    code: "SH.MED.BEDS.ZS",
    name: "Hospital beds (per 1,000 people)",
    unit: "per 1,000 people",
    domain: "Health Systems",
    disease: "",
    ageGroup: "All ages",
  },
  {
    code: "SH.STA.STNT.ZS",
    name: "Stunting prevalence, height for age (% of children under 5)",
    unit: "percentage",
    domain: "Nutrition",
    disease: "Stunting",
    ageGroup: "Under 5",
  },
  {
    code: "SH.STA.WASH.P5",
    name: "Mortality from unsafe water, sanitation, hygiene (per 100,000)",
    unit: "per 100,000 population",
    domain: "Environmental Health",
    disease: "Water-borne diseases",
    ageGroup: "All ages",
  },
  {
    code: "SH.PRV.SMOK.MA",
    name: "Smoking prevalence, males (% of adults)",
    unit: "percentage",
    domain: "Risk Factors",
    disease: "Tobacco use",
    ageGroup: "15+",
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
 * Fetch all health indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<HealthRecord[]> {
  const records: HealthRecord[] = [];

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
          diseaseOrCondition: ind.disease,
          ageGroup: ind.ageGroup,
          sex: "Both",
          healthDomain: ind.domain,
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

