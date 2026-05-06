import type { AgricultureRecord } from "./types.js";

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
// World Bank agriculture indicator codes with metadata
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  domain: string;
  crop: string;
}> = [
  {
    code: "AG.PRD.FOOD.XD",
    name: "Food production index (2014-2016 = 100)",
    unit: "index",
    domain: "Production",
    crop: "",
  },
  {
    code: "AG.YLD.CREL.KG",
    name: "Cereal yield (kg per hectare)",
    unit: "kg per hectare",
    domain: "Production",
    crop: "Cereals",
  },
  {
    code: "AG.LND.ARBL.ZS",
    name: "Arable land (% of land area)",
    unit: "percentage",
    domain: "Production",
    crop: "",
  },
  {
    code: "AG.LND.AGRI.ZS",
    name: "Agricultural land (% of land area)",
    unit: "percentage",
    domain: "Production",
    crop: "",
  },
  {
    code: "AG.PRD.CREL.MT",
    name: "Cereal production (metric tons)",
    unit: "metric tons",
    domain: "Production",
    crop: "Cereals",
  },
  {
    code: "AG.PRD.LVSK.XD",
    name: "Livestock production index (2014-2016 = 100)",
    unit: "index",
    domain: "Production",
    crop: "Livestock",
  },
  {
    code: "NV.AGR.TOTL.ZS",
    name: "Agriculture, forestry, and fishing value added (% of GDP)",
    unit: "percentage",
    domain: "Trade",
    crop: "",
  },
  {
    code: "SN.ITK.DEFC.ZS",
    name: "Prevalence of undernourishment (% of population)",
    unit: "percentage",
    domain: "Food Security",
    crop: "",
  },
  {
    code: "SH.STA.STNT.ZS",
    name: "Prevalence of stunting among children under 5 (% of children under 5)",
    unit: "percentage",
    domain: "Food Security",
    crop: "",
  },
  {
    code: "AG.LND.FRST.ZS",
    name: "Forest area (% of land area)",
    unit: "percentage",
    domain: "Production",
    crop: "",
  },
  {
    code: "ER.H2O.FWTL.ZS",
    name: "Annual freshwater withdrawals, agriculture (% of total)",
    unit: "percentage",
    domain: "Water Resources",
    crop: "",
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
 * Fetch all agriculture indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<AgricultureRecord[]> {
  const records: AgricultureRecord[] = [];

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
          sourceOrganization: "World Bank",
          datasetName: "World Development Indicators",
          dataSourceUrl: `https://data.worldbank.org/indicator/${ind.code}`,
          agriculturalDomain: ind.domain,
          cropOrCommodity: ind.crop,
          foodSecurityPhase: "",
          productionVolume: 0,
          tradeFlow: "",
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

