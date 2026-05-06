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
/**
 * OWID cross-cutting datasets. Uses the energy data CSV which contains
 * population, GDP, and energy columns spanning multiple sectors.
 */
const OWID_DATASETS: Array<{
  url: string;
  name: string;
  sdgGoal: string;
  sdgTarget: string;
  sector: string;
  valueColumn: string;
  unit: string;
  indicatorLabel: string;
}> = [
  {
    url: "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv",
    name: "OWID Energy Data",
    sdgGoal: "SDG 7: Affordable and Clean Energy",
    sdgTarget: "7.2",
    sector: "Energy",
    valueColumn: "renewables_share_energy",
    unit: "percentage",
    indicatorLabel: "Renewables share of primary energy",
  },
  {
    url: "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv",
    name: "OWID Energy Data",
    sdgGoal: "SDG 7: Affordable and Clean Energy",
    sdgTarget: "7.1",
    sector: "Energy",
    valueColumn: "per_capita_electricity",
    unit: "kWh per person",
    indicatorLabel: "Per capita electricity consumption",
  },
  {
    url: "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv",
    name: "OWID Energy Data",
    sdgGoal: "SDG 13: Climate Action",
    sdgTarget: "13.2",
    sector: "Climate",
    valueColumn: "carbon_intensity_elec",
    unit: "gCO₂/kWh",
    indicatorLabel: "Carbon intensity of electricity generation",
  },
  {
    url: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
    name: "OWID CO2 and Greenhouse Gas Emissions",
    sdgGoal: "SDG 13: Climate Action",
    sdgTarget: "13.2",
    sector: "Climate",
    valueColumn: "co2_per_capita",
    unit: "tonnes per person",
    indicatorLabel: "Annual CO₂ emissions per capita",
  },
  {
    url: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
    name: "OWID CO2 and Greenhouse Gas Emissions",
    sdgGoal: "SDG 13: Climate Action",
    sdgTarget: "13.2",
    sector: "Climate",
    valueColumn: "ghg_per_capita",
    unit: "tonnes CO₂-eq per person",
    indicatorLabel: "Total GHG emissions per capita",
  },
];

// ISO3 to region mapping for OWID data
const OWID_ISO_REGION_MAP: Record<string, string> = {
  AFG: "South Asia", AGO: "Sub-Saharan Africa", ALB: "Europe & Central Asia",
  ARE: "Middle East & North Africa", ARG: "Latin America & Caribbean",
  AUS: "East Asia & Pacific", AUT: "Europe & Central Asia",
  BGD: "South Asia", BRA: "Latin America & Caribbean",
  CAN: "North America", CHN: "East Asia & Pacific",
  COD: "Sub-Saharan Africa", COL: "Latin America & Caribbean",
  DEU: "Europe & Central Asia", EGY: "Middle East & North Africa",
  ETH: "Sub-Saharan Africa", FRA: "Europe & Central Asia",
  GBR: "Europe & Central Asia", GHA: "Sub-Saharan Africa",
  IND: "South Asia", IDN: "East Asia & Pacific",
  IRN: "Middle East & North Africa", IRQ: "Middle East & North Africa",
  ITA: "Europe & Central Asia", JPN: "East Asia & Pacific",
  KEN: "Sub-Saharan Africa", KOR: "East Asia & Pacific",
  MEX: "Latin America & Caribbean", MYS: "East Asia & Pacific",
  NGA: "Sub-Saharan Africa", PAK: "South Asia",
  PER: "Latin America & Caribbean", PHL: "East Asia & Pacific",
  POL: "Europe & Central Asia", RUS: "Europe & Central Asia",
  SAU: "Middle East & North Africa", THA: "East Asia & Pacific",
  TUR: "Europe & Central Asia", TZA: "Sub-Saharan Africa",
  UKR: "Europe & Central Asia", USA: "North America",
  VNM: "East Asia & Pacific", ZAF: "Sub-Saharan Africa",
};

/**
 * Stream-parse a CSV from a URL line-by-line to minimize memory usage.
 * Returns parsed rows as objects keyed by header columns.
 */
async function fetchCsvRows(
  url: string
): Promise<Array<Record<string, string>>> {
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Fetch and parse Our World in Data cross-cutting datasets.
 * Filters to real countries (excludes aggregates like "World", "EU").
 */
export async function fetchOwidData(): Promise<MultiSectorRecord[]> {
  const records: MultiSectorRecord[] = [];
  const csvCache = new Map<string, Array<Record<string, string>>>();

  for (const ds of OWID_DATASETS) {
    let rows: Array<Record<string, string>>;
    if (csvCache.has(ds.url)) {
      rows = csvCache.get(ds.url)!;
    } else {
      rows = await fetchCsvRows(ds.url);
      csvCache.set(ds.url, rows);
    }

    for (const row of rows) {
      const country = row["country"] ?? "";
      const iso = row["iso_code"] ?? "";
      const yearStr = row["year"] ?? "";
      const valueStr = row[ds.valueColumn] ?? "";

      // Skip aggregates and rows without data
      if (!iso || iso.length !== 3 || !yearStr || !valueStr) continue;
      const yearNum = parseInt(yearStr, 10);
      if (isNaN(yearNum) || yearNum < 2000) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;

      records.push({
        sourceKey: `multi-owid-${iso}-${ds.valueColumn}-${yearNum}`,
        title: `${country}: ${ds.indicatorLabel} (${yearNum})`,
        country,
        countryISO3: iso,
        region: OWID_ISO_REGION_MAP[iso] ?? "",
        year: yearNum,
        indicatorName: ds.indicatorLabel,
        indicatorValue: String(value),
        measureUnit: ds.unit,
        sourceOrganization: "Our World in Data",
        datasetName: ds.name,
        dataSourceUrl: ds.url.includes("co2-data")
          ? "https://github.com/owid/co2-data"
          : "https://github.com/owid/energy-data",
        sdgGoal: ds.sdgGoal,
        sdgTarget: ds.sdgTarget,
        sectorClassification: ds.sector,
        dataFrequency: "Annual",
        dataFormat: "CSV",
        tags: [ds.sector, ds.sdgGoal, "OWID", ds.valueColumn],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

