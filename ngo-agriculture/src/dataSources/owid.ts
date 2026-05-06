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
/**
 * OWID agriculture and food security datasets from GitHub.
 * Uses the owid-datasets repository for stable CSV access.
 */
const OWID_DATASETS: Array<{
  url: string;
  name: string;
  domain: string;
  crop: string;
  /** Column mapping: which CSV column holds the value */
  valueColumn: string;
  unit: string;
  indicatorLabel: string;
}> = [
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Food%20supply%20(FAO%2C%202020)/Food%20supply%20(FAO%2C%202020).csv",
    name: "Food Supply (FAO, 2020)",
    domain: "Food Security",
    crop: "",
    valueColumn: "Food supply (kcal/capita/day) - Grand Total",
    unit: "kcal/capita/day",
    indicatorLabel: "Daily food supply per capita",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Food%20supply%20(FAO%2C%202020)/Food%20supply%20(FAO%2C%202020).csv",
    name: "Food Supply (FAO, 2020)",
    domain: "Food Security",
    crop: "",
    valueColumn: "Protein supply quantity (g/capita/day) - Grand Total",
    unit: "g/capita/day",
    indicatorLabel: "Daily protein supply per capita",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Food%20supply%20(FAO%2C%202020)/Food%20supply%20(FAO%2C%202020).csv",
    name: "Food Supply (FAO, 2020)",
    domain: "Production",
    crop: "Meat",
    valueColumn: "Meat food supply quantity (kg/capita/yr)",
    unit: "kg/capita/yr",
    indicatorLabel: "Meat food supply per capita",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Agricultural%20total%20factor%20productivity%20(USDA)/Agricultural%20total%20factor%20productivity%20(USDA).csv",
    name: "Agricultural Total Factor Productivity (USDA)",
    domain: "Production",
    crop: "",
    valueColumn: "tfp",
    unit: "index",
    indicatorLabel: "Agricultural total factor productivity",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Agricultural%20total%20factor%20productivity%20(USDA)/Agricultural%20total%20factor%20productivity%20(USDA).csv",
    name: "Agricultural Total Factor Productivity (USDA)",
    domain: "Production",
    crop: "Crops",
    valueColumn: "crop_output_quantity",
    unit: "tonnes",
    indicatorLabel: "Crop output quantity",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Agricultural%20total%20factor%20productivity%20(USDA)/Agricultural%20total%20factor%20productivity%20(USDA).csv",
    name: "Agricultural Total Factor Productivity (USDA)",
    domain: "Production",
    crop: "Livestock",
    valueColumn: "animal_output_quantity",
    unit: "tonnes",
    indicatorLabel: "Animal output quantity",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Cereal%20allocation%20to%20food%2C%20feed%2C%20fuel%20(OWID%20based%20on%20FAO)/Cereal%20allocation%20to%20food%2C%20feed%2C%20fuel%20(OWID%20based%20on%20FAO).csv",
    name: "Cereal Allocation (OWID/FAO)",
    domain: "Trade",
    crop: "Cereals",
    valueColumn: "Cereals allocated to food (tonnes) (FAO, 2020)",
    unit: "tonnes",
    indicatorLabel: "Cereals allocated to food",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Cereal%20allocation%20to%20food%2C%20feed%2C%20fuel%20(OWID%20based%20on%20FAO)/Cereal%20allocation%20to%20food%2C%20feed%2C%20fuel%20(OWID%20based%20on%20FAO).csv",
    name: "Cereal Allocation (OWID/FAO)",
    domain: "Trade",
    crop: "Cereals",
    valueColumn: "Cereals allocated to animal feed (tonnes) (FAO, 2020)",
    unit: "tonnes",
    indicatorLabel: "Cereals allocated to animal feed",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Global%20Hunger%20Index%20(2021)/Global%20Hunger%20Index%20(2021).csv",
    name: "Global Hunger Index (2021)",
    domain: "Food Security",
    crop: "",
    valueColumn: "Global Hunger Index (2021)",
    unit: "index (0-100)",
    indicatorLabel: "Global Hunger Index",
  },
];

// Region mapping for OWID Entity names (countries)
const OWID_COUNTRY_REGION_MAP: Record<string, string> = {
  Afghanistan: "South Asia",
  Angola: "Sub-Saharan Africa",
  Albania: "Europe & Central Asia",
  "United Arab Emirates": "Middle East & North Africa",
  Argentina: "Latin America & Caribbean",
  Australia: "East Asia & Pacific",
  Austria: "Europe & Central Asia",
  Brazil: "Latin America & Caribbean",
  Canada: "North America",
  China: "East Asia & Pacific",
  "Democratic Republic of Congo": "Sub-Saharan Africa",
  Germany: "Europe & Central Asia",
  Egypt: "Middle East & North Africa",
  Ethiopia: "Sub-Saharan Africa",
  France: "Europe & Central Asia",
  "United Kingdom": "Europe & Central Asia",
  Ghana: "Sub-Saharan Africa",
  India: "South Asia",
  Indonesia: "East Asia & Pacific",
  Iran: "Middle East & North Africa",
  Iraq: "Middle East & North Africa",
  Italy: "Europe & Central Asia",
  Japan: "East Asia & Pacific",
  Kenya: "Sub-Saharan Africa",
  "South Korea": "East Asia & Pacific",
  Mexico: "Latin America & Caribbean",
  Malaysia: "East Asia & Pacific",
  Nigeria: "Sub-Saharan Africa",
  Pakistan: "South Asia",
  Philippines: "East Asia & Pacific",
  Poland: "Europe & Central Asia",
  Russia: "Europe & Central Asia",
  "Saudi Arabia": "Middle East & North Africa",
  Thailand: "East Asia & Pacific",
  Turkey: "Europe & Central Asia",
  Ukraine: "Europe & Central Asia",
  "United States": "North America",
  Vietnam: "East Asia & Pacific",
  "South Africa": "Sub-Saharan Africa",
  Bangladesh: "South Asia",
  Colombia: "Latin America & Caribbean",
  Peru: "Latin America & Caribbean",
  Chile: "Latin America & Caribbean",
  Tanzania: "Sub-Saharan Africa",
  Uganda: "Sub-Saharan Africa",
  Mozambique: "Sub-Saharan Africa",
  Myanmar: "East Asia & Pacific",
  Nepal: "South Asia",
  Cambodia: "East Asia & Pacific",
  Yemen: "Middle East & North Africa",
  Sudan: "Sub-Saharan Africa",
  "South Sudan": "Sub-Saharan Africa",
  Somalia: "Sub-Saharan Africa",
  Mali: "Sub-Saharan Africa",
  Niger: "Sub-Saharan Africa",
  Chad: "Sub-Saharan Africa",
  Madagascar: "Sub-Saharan Africa",
  Malawi: "Sub-Saharan Africa",
  Zambia: "Sub-Saharan Africa",
  Zimbabwe: "Sub-Saharan Africa",
};

// Aggregates to skip in OWID datasets
const OWID_AGGREGATES = new Set([
  "World",
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "European Union",
  "High income",
  "Low income",
  "Lower middle income",
  "Upper middle income",
  "OECD",
  "Non-OECD",
  "EU",
  "USSR",
  "Czechoslovakia",
  "Yugoslavia",
  "East Asia & Pacific",
  "Europe & Central Asia",
  "Latin America & Caribbean",
  "Middle East & North Africa",
  "Sub-Saharan Africa",
]);

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

  // Handle CSV fields that may contain commas within quotes
  const headers = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/** Parse a CSV line respecting quoted fields that may contain commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Fetch and parse Our World in Data agriculture datasets.
 * Filters to real countries (excludes aggregates like "World", "EU").
 */
export async function fetchOwidData(): Promise<AgricultureRecord[]> {
  const records: AgricultureRecord[] = [];
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
      const entity = row["Entity"] ?? "";
      const yearStr = row["Year"] ?? "";
      const valueStr = row[ds.valueColumn] ?? "";

      // Skip aggregates and rows without data
      if (OWID_AGGREGATES.has(entity)) continue;
      if (!yearStr || !valueStr) continue;
      const yearNum = parseInt(yearStr, 10);
      if (isNaN(yearNum) || yearNum < 2000) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;

      const region = OWID_COUNTRY_REGION_MAP[entity] ?? "";

      records.push({
        sourceKey: `owid-${entity.replace(/[^a-zA-Z0-9]/g, "_")}-${ds.valueColumn.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40)}-${yearNum}`,
        title: `${entity}: ${ds.indicatorLabel} (${yearNum})`,
        country: entity,
        countryISO3: "",
        region,
        year: yearNum,
        indicatorName: ds.indicatorLabel,
        indicatorValue: String(value),
        sourceOrganization: "Our World in Data",
        datasetName: ds.name,
        dataSourceUrl: "https://github.com/owid/owid-datasets",
        agriculturalDomain: ds.domain,
        cropOrCommodity: ds.crop,
        foodSecurityPhase: "",
        productionVolume: 0,
        tradeFlow: "",
        tags: [ds.domain, "OWID", ds.indicatorLabel],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

