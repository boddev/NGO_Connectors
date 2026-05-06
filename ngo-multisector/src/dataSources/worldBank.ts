import type { MultiSectorRecord } from "./types.js";

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
// Cross-cutting World Bank indicators spanning multiple SDGs
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  sdgGoal: string;
  sdgTarget: string;
  sector: string;
}> = [
  {
    code: "SP.POP.TOTL",
    name: "Population, total",
    unit: "people",
    sdgGoal: "SDG 17: Partnerships for the Goals",
    sdgTarget: "17.19",
    sector: "Demographics",
  },
  {
    code: "NY.GDP.PCAP.CD",
    name: "GDP per capita (current US$)",
    unit: "current US$",
    sdgGoal: "SDG 8: Decent Work and Economic Growth",
    sdgTarget: "8.1",
    sector: "Economics",
  },
  {
    code: "SI.POV.DDAY",
    name: "Poverty headcount ratio at $2.15 a day (2017 PPP) (% of population)",
    unit: "percentage",
    sdgGoal: "SDG 1: No Poverty",
    sdgTarget: "1.1",
    sector: "Poverty",
  },
  {
    code: "SH.DYN.MORT",
    name: "Mortality rate, under-5 (per 1,000 live births)",
    unit: "per 1,000 live births",
    sdgGoal: "SDG 3: Good Health and Well-Being",
    sdgTarget: "3.2",
    sector: "Health",
  },
  {
    code: "SE.ADT.LITR.ZS",
    name: "Literacy rate, adult total (% of people ages 15 and above)",
    unit: "percentage",
    sdgGoal: "SDG 4: Quality Education",
    sdgTarget: "4.6",
    sector: "Education",
  },
  {
    code: "SH.H2O.BASW.ZS",
    name: "People using at least basic drinking water services (% of population)",
    unit: "percentage",
    sdgGoal: "SDG 6: Clean Water and Sanitation",
    sdgTarget: "6.1",
    sector: "Water",
  },
  {
    code: "EG.ELC.ACCS.ZS",
    name: "Access to electricity (% of population)",
    unit: "percentage",
    sdgGoal: "SDG 7: Affordable and Clean Energy",
    sdgTarget: "7.1",
    sector: "Energy",
  },
  {
    code: "SG.GEN.PARL.ZS",
    name: "Proportion of seats held by women in national parliaments (%)",
    unit: "percentage",
    sdgGoal: "SDG 5: Gender Equality",
    sdgTarget: "5.5",
    sector: "Governance",
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
 * Fetch cross-cutting indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<MultiSectorRecord[]> {
  const records: MultiSectorRecord[] = [];

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
          sourceKey: `multi-wb-${dp.countryiso3code}-${ind.code}-${dp.date}`,
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
          sdgGoal: ind.sdgGoal,
          sdgTarget: ind.sdgTarget,
          sectorClassification: ind.sector,
          dataFrequency: "Annual",
          dataFormat: "JSON",
          tags: [ind.sector, ind.sdgGoal, "World Bank", ind.code],
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

