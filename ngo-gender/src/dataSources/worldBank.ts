import type { GenderRecord } from "./types.js";

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
// World Bank gender indicator codes with metadata
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  domain: string;
  genderIndicator: string;
}> = [
  {
    code: "SG.GEN.PARL.ZS",
    name: "Proportion of seats held by women in national parliaments (%)",
    unit: "percentage",
    domain: "Political Participation",
    genderIndicator: "Women in Parliament %",
  },
  {
    code: "SL.TLF.CACT.FE.ZS",
    name: "Labor force participation rate, female (% of female population ages 15+)",
    unit: "percentage",
    domain: "Economic",
    genderIndicator: "Female Labor Force Participation",
  },
  {
    code: "SE.ENR.PRSC.FM.ZS",
    name: "School enrollment, primary and secondary (gross), gender parity index (GPI)",
    unit: "index",
    domain: "Education",
    genderIndicator: "Gender Parity Index — Primary & Secondary",
  },
  {
    code: "SP.ADO.TFRT",
    name: "Adolescent fertility rate (births per 1,000 women ages 15-19)",
    unit: "births per 1,000 women",
    domain: "Health",
    genderIndicator: "Adolescent Fertility Rate",
  },
  {
    code: "SH.STA.MMRT",
    name: "Maternal mortality ratio (per 100,000 live births)",
    unit: "deaths per 100,000 live births",
    domain: "Health",
    genderIndicator: "Maternal Mortality Ratio",
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
 * Classify a numeric value as a participation rate or GPI depending on domain.
 */
function classifyValue(
  value: number,
  domain: string
): { participationRate: number; genderParityIndex: number } {
  if (domain === "Education") {
    return { participationRate: 0, genderParityIndex: value };
  }
  if (domain === "Political Participation" || domain === "Economic") {
    return { participationRate: value, genderParityIndex: 0 };
  }
  return { participationRate: 0, genderParityIndex: 0 };
}

/**
 * Fetch all gender indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<GenderRecord[]> {
  const records: GenderRecord[] = [];

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
        const { participationRate, genderParityIndex } = classifyValue(
          dp.value,
          ind.domain
        );

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
          datasetName: "World Development Indicators — Gender",
          dataSourceUrl: `https://data.worldbank.org/indicator/${ind.code}`,
          genderIndicator: ind.genderIndicator,
          genderParityIndex,
          violenceType: "",
          participationRate,
          genderDomain: ind.domain,
          tags: [ind.domain, "World Bank", ind.code, "Gender Equality"],
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

