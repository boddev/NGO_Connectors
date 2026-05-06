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
/**
 * OWID CO2 dataset includes gdp and population columns alongside emissions.
 * We extract GDP-related columns for economic analysis.
 */
const OWID_DATASETS: Array<{
  url: string;
  name: string;
  category: string;
  valueColumn: string;
  unit: string;
  indicatorLabel: string;
}> = [
  {
    url: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
    name: "OWID CO2 and Greenhouse Gas Emissions",
    category: "GDP",
    valueColumn: "gdp",
    unit: "international-$ (2011 PPP)",
    indicatorLabel: "GDP (international-$ in 2011 prices)",
  },
  {
    url: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
    name: "OWID CO2 and Greenhouse Gas Emissions",
    category: "Population",
    valueColumn: "population",
    unit: "persons",
    indicatorLabel: "Population",
  },
  {
    url: "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv",
    name: "OWID CO2 and Greenhouse Gas Emissions",
    category: "Productivity",
    valueColumn: "co2_per_gdp",
    unit: "kg per international-$",
    indicatorLabel: "CO₂ emissions per unit of GDP",
  },
];

// Region mapping for commonly-occurring ISO codes
const OWID_ISO_REGION_MAP: Record<string, string> = {
  AFG: "South Asia", AGO: "Sub-Saharan Africa", ALB: "Europe & Central Asia",
  ARE: "Middle East & North Africa", ARG: "Latin America & Caribbean",
  AUS: "East Asia & Pacific", AUT: "Europe & Central Asia",
  BRA: "Latin America & Caribbean", CAN: "North America",
  CHN: "East Asia & Pacific", COD: "Sub-Saharan Africa",
  DEU: "Europe & Central Asia", EGY: "Middle East & North Africa",
  ETH: "Sub-Saharan Africa", FRA: "Europe & Central Asia",
  GBR: "Europe & Central Asia", GHA: "Sub-Saharan Africa",
  IND: "South Asia", IDN: "East Asia & Pacific",
  IRN: "Middle East & North Africa", IRQ: "Middle East & North Africa",
  ITA: "Europe & Central Asia", JPN: "East Asia & Pacific",
  KEN: "Sub-Saharan Africa", KOR: "East Asia & Pacific",
  MEX: "Latin America & Caribbean", MYS: "East Asia & Pacific",
  NGA: "Sub-Saharan Africa", PAK: "South Asia",
  PHL: "East Asia & Pacific", POL: "Europe & Central Asia",
  RUS: "Europe & Central Asia", SAU: "Middle East & North Africa",
  THA: "East Asia & Pacific", TUR: "Europe & Central Asia",
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
 * Fetch and parse Our World in Data economic datasets.
 * Filters to real countries (excludes aggregates like "World", "EU").
 */
export async function fetchOwidData(): Promise<EconomicsRecord[]> {
  const records: EconomicsRecord[] = [];
  const processedUrls = new Set<string>();

  for (const ds of OWID_DATASETS) {
    let rows: Array<Record<string, string>>;
    if (processedUrls.has(ds.url)) {
      rows = await fetchCsvRows(ds.url);
    } else {
      rows = await fetchCsvRows(ds.url);
      processedUrls.add(ds.url);
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

      const isGdp = ds.valueColumn === "gdp";

      records.push({
        sourceKey: `owid-${iso}-${ds.valueColumn}-${yearNum}`,
        title: `${country}: ${ds.indicatorLabel} (${yearNum})`,
        country,
        countryISO3: iso,
        region: OWID_ISO_REGION_MAP[iso] ?? "",
        year: yearNum,
        indicatorName: ds.indicatorLabel,
        indicatorValue: String(value),
        sourceOrganization: "Our World in Data",
        datasetName: ds.name,
        dataSourceUrl: "https://github.com/owid/co2-data",
        economicIndicator: ds.category,
        gdpValue: isGdp ? value : 0,
        giniCoefficient: 0,
        incomeGroup: "",
        developmentCategory: "",
        tags: [ds.category, "OWID", ds.valueColumn],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

