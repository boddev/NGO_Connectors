import type { EnvironmentRecord } from "./types.js";

// World Bank climate indicator codes with metadata
const INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  domain: string;
  emissionType: string;
}> = [
  {
    code: "EN.GHG.CO2.PC.CE.AR5",
    name: "CO2 emissions per capita (metric tons of CO2 equivalent)",
    unit: "metric tons CO2-eq per capita",
    domain: "Climate",
    emissionType: "CO2",
  },
  {
    code: "EN.GHG.CO2.MT.CE.AR5",
    name: "CO2 emissions total (Mt of CO2 equivalent, AR5)",
    unit: "Mt CO2 equivalent",
    domain: "Climate",
    emissionType: "CO2",
  },
  {
    code: "EN.GHG.ALL.MT.CE.AR5",
    name: "Total greenhouse gas emissions excluding LULUCF (Mt CO2e)",
    unit: "Mt CO2e",
    domain: "Climate",
    emissionType: "GHG",
  },
  {
    code: "EG.FEC.RNEW.ZS",
    name: "Renewable energy consumption (% of total final energy)",
    unit: "percentage",
    domain: "Energy",
    emissionType: "",
  },
  {
    code: "EG.ELC.RNEW.ZS",
    name: "Renewable electricity output (% of total electricity)",
    unit: "percentage",
    domain: "Energy",
    emissionType: "",
  },
  {
    code: "AG.LND.FRST.ZS",
    name: "Forest area (% of land area)",
    unit: "percentage",
    domain: "Forests",
    emissionType: "",
  },
  {
    code: "AG.LND.FRST.K2",
    name: "Forest area (sq. km)",
    unit: "sq. km",
    domain: "Forests",
    emissionType: "",
  },
  {
    code: "EN.ATM.PM25.MC.M3",
    name: "PM2.5 air pollution (micrograms per cubic meter)",
    unit: "µg/m³",
    domain: "Air Quality",
    emissionType: "",
  },
  {
    code: "ER.PTD.TOTL.ZS",
    name: "Terrestrial and marine protected areas (% of total territorial area)",
    unit: "percentage",
    domain: "Biodiversity",
    emissionType: "",
  },
  {
    code: "EN.CLC.MDAT.ZS",
    name: "Droughts, floods, extreme temperatures (% pop affected, 1990-2009 avg)",
    unit: "percentage",
    domain: "Disasters",
    emissionType: "",
  },
  {
    code: "ER.H2O.FWTL.ZS",
    name: "Annual freshwater withdrawals (% of internal resources)",
    unit: "percentage",
    domain: "Water",
    emissionType: "",
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

async function fetchWithTimeout(
  url: string,
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch all climate indicators from the World Bank API.
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankData(): Promise<EnvironmentRecord[]> {
  const records: EnvironmentRecord[] = [];

  for (const ind of INDICATORS) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url =
        `https://api.worldbank.org/v2/country/all/indicator/${ind.code}` +
        `?format=json&per_page=300&date=2000:2025&page=${page}`;

      let response: Response;
      try {
        response = await fetchWithTimeout(url);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(
          `World Bank API timeout/error for ${ind.code} page ${page}: ${msg}`
        );
        break;
      }

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
          environmentalDomain: ind.domain,
          emissionType: ind.emissionType,
          speciesName: "",
          conservationStatus: "",
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
