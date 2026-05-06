import type { EconomicsRecord } from "./types.js";

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
// World Bank economic indicator codes with metadata
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  category: string;
  /** If this indicator represents GDP, set to true to populate gdpValue */
  isGdp: boolean;
  /** If this indicator is Gini, set to true to populate giniCoefficient */
  isGini: boolean;
}> = [
  {
    code: "NY.GDP.PCAP.CD",
    name: "GDP per capita (current US$)",
    unit: "current US$",
    category: "GDP",
    isGdp: true,
    isGini: false,
  },
  {
    code: "NY.GDP.MKTP.CD",
    name: "GDP (current US$)",
    unit: "current US$",
    category: "GDP",
    isGdp: true,
    isGini: false,
  },
  {
    code: "SI.POV.DDAY",
    name: "Poverty headcount ratio at $2.15/day (% of population)",
    unit: "percentage",
    category: "Poverty",
    isGdp: false,
    isGini: false,
  },
  {
    code: "SI.POV.GINI",
    name: "Gini index",
    unit: "index (0–100)",
    category: "Inequality",
    isGdp: false,
    isGini: true,
  },
  {
    code: "SL.UEM.TOTL.ZS",
    name: "Unemployment, total (% of total labor force, modeled ILO estimate)",
    unit: "percentage",
    category: "Employment",
    isGdp: false,
    isGini: false,
  },
  {
    code: "SP.POP.TOTL",
    name: "Population, total",
    unit: "persons",
    category: "Population",
    isGdp: false,
    isGini: false,
  },
  {
    code: "NY.GNP.PCAP.CD",
    name: "GNI per capita, Atlas method (current US$)",
    unit: "current US$",
    category: "Income",
    isGdp: false,
    isGini: false,
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

// World Bank income group mapping
const WB_INCOME_GROUPS: Record<string, string> = {
  HIC: "High income",
  UMC: "Upper middle income",
  LMC: "Lower middle income",
  LIC: "Low income",
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

interface WBCountryMeta {
  id: string;
  iso2Code: string;
  name: string;
  incomeLevel?: { id: string; value: string };
  region?: { id: string; value: string };
}

// Cached country metadata for income group lookup
let _countryMetaCache: Map<string, WBCountryMeta> | null = null;

async function fetchCountryMetadata(): Promise<Map<string, WBCountryMeta>> {
  if (_countryMetaCache) return _countryMetaCache;

  const map = new Map<string, WBCountryMeta>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `https://api.worldbank.org/v2/country/all?format=json&per_page=300&page=${page}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) break;

    const json = (await response.json()) as [WBApiResponse, WBCountryMeta[]];
    if (!json || !json[1]) break;

    totalPages = json[0].pages;
    for (const c of json[1]) {
      map.set(c.id, c);
    }
    page++;
  }

  _countryMetaCache = map;
  return map;
}

/**
 * Fetch all economic indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<EconomicsRecord[]> {
  const records: EconomicsRecord[] = [];
  const countryMeta = await fetchCountryMetadata();

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

        // Look up income group from country metadata
        const cMeta = countryMeta.get(dp.country.id);
        const incomeGroupId = cMeta?.incomeLevel?.id ?? "";
        const incomeGroup = WB_INCOME_GROUPS[incomeGroupId] ?? "";

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
          economicIndicator: ind.category,
          gdpValue: ind.isGdp ? dp.value : 0,
          giniCoefficient: ind.isGini ? dp.value : 0,
          incomeGroup,
          developmentCategory: "",
          tags: [ind.category, "World Bank", ind.code],
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

