import type { RefugeeRecord } from "./types.js";

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
// World Bank migration and remittance indicator codes
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  displacementType: string;
}> = [
  {
    code: "SM.POP.NETM",
    name: "Net migration",
    unit: "persons",
    displacementType: "Migration",
  },
  {
    code: "SM.POP.TOTL",
    name: "International migrant stock, total",
    unit: "persons",
    displacementType: "Migration",
  },
  {
    code: "SM.POP.TOTL.ZS",
    name: "International migrant stock (% of population)",
    unit: "percentage",
    displacementType: "Migration",
  },
  {
    code: "BX.TRF.PWKR.CD.DT",
    name: "Personal remittances, received (current US$)",
    unit: "current US$",
    displacementType: "Remittance",
  },
  {
    code: "BX.TRF.PWKR.DT.GD.ZS",
    name: "Personal remittances, received (% of GDP)",
    unit: "percentage",
    displacementType: "Remittance",
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
 * Fetch migration and remittance indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankMigrationData(): Promise<RefugeeRecord[]> {
  const records: RefugeeRecord[] = [];

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
          displacementType: ind.displacementType,
          populationGroup: "",
          countryOfOrigin: "",
          countryOfAsylum: "",
          displacedPopulation: 0,
          tags: [ind.displacementType, "World Bank", ind.code],
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

