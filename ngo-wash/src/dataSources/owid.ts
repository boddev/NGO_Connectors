import type { WashRecord } from "./types.js";

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
 * OWID Water and Sanitation dataset (WHO WASH, 2021) hosted on GitHub.
 *
 * CSV columns include percentage and absolute-number variants for water,
 * sanitation, and hygiene — each broken down by total, rural, and urban.
 *
 * Key column prefixes:
 *  - wat_ = drinking water, san_ = sanitation, hyg_ = hygiene
 *  - _bas = basic, _sm = safely managed, _lim = limited,
 *    _unimp = unimproved, _sur = surface water, _od = open defecation
 *  - _rural / _urban suffixes = disaggregated, no suffix = total
 */

const OWID_WASH_CSV_URL =
  "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/" +
  "Water%20and%20Sanitation%20(WHO%20WASH%2C%202021)/" +
  "Water%20and%20Sanitation%20(WHO%20WASH%2C%202021).csv";

// Map of CSV columns to extract, with their human-readable labels
const OWID_INDICATORS: Array<{
  column: string;
  name: string;
  washService: string;
  serviceLevel: string;
  urbanRural: string;
}> = [
  // ── Total (national) ──
  {
    column: "wat_bas",
    name: "Basic drinking water services (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Basic",
    urbanRural: "Total",
  },
  {
    column: "wat_sm",
    name: "Safely managed drinking water services (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Safely managed",
    urbanRural: "Total",
  },
  {
    column: "wat_lim",
    name: "Limited drinking water services (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Limited",
    urbanRural: "Total",
  },
  {
    column: "san_bas",
    name: "Basic sanitation services (% of population)",
    washService: "Sanitation",
    serviceLevel: "Basic",
    urbanRural: "Total",
  },
  {
    column: "san_sm",
    name: "Safely managed sanitation services (% of population)",
    washService: "Sanitation",
    serviceLevel: "Safely managed",
    urbanRural: "Total",
  },
  {
    column: "san_od",
    name: "Open defecation (% of population)",
    washService: "Sanitation",
    serviceLevel: "No service",
    urbanRural: "Total",
  },
  {
    column: "hyg_bas",
    name: "Basic hygiene facilities (% of population)",
    washService: "Hygiene",
    serviceLevel: "Basic",
    urbanRural: "Total",
  },

  // ── Rural ──
  {
    column: "wat_bas_rural",
    name: "Basic drinking water — Rural (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Basic",
    urbanRural: "Rural",
  },
  {
    column: "wat_sm_rural",
    name: "Safely managed drinking water — Rural (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Safely managed",
    urbanRural: "Rural",
  },
  {
    column: "san_bas_rural",
    name: "Basic sanitation — Rural (% of population)",
    washService: "Sanitation",
    serviceLevel: "Basic",
    urbanRural: "Rural",
  },
  {
    column: "san_od_rural",
    name: "Open defecation — Rural (% of population)",
    washService: "Sanitation",
    serviceLevel: "No service",
    urbanRural: "Rural",
  },
  {
    column: "hyg_bas_rural",
    name: "Basic hygiene — Rural (% of population)",
    washService: "Hygiene",
    serviceLevel: "Basic",
    urbanRural: "Rural",
  },

  // ── Urban ──
  {
    column: "wat_bas_urban",
    name: "Basic drinking water — Urban (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Basic",
    urbanRural: "Urban",
  },
  {
    column: "wat_sm_urban",
    name: "Safely managed drinking water — Urban (% of population)",
    washService: "Drinking Water",
    serviceLevel: "Safely managed",
    urbanRural: "Urban",
  },
  {
    column: "san_bas_urban",
    name: "Basic sanitation — Urban (% of population)",
    washService: "Sanitation",
    serviceLevel: "Basic",
    urbanRural: "Urban",
  },
  {
    column: "san_od_urban",
    name: "Open defecation — Urban (% of population)",
    washService: "Sanitation",
    serviceLevel: "No service",
    urbanRural: "Urban",
  },
  {
    column: "hyg_bas_urban",
    name: "Basic hygiene — Urban (% of population)",
    washService: "Hygiene",
    serviceLevel: "Basic",
    urbanRural: "Urban",
  },
];

// Region lookup for OWID entity names (countries only, not aggregates)
const OWID_COUNTRY_REGION: Record<string, string> = {
  Afghanistan: "South Asia", Angola: "Sub-Saharan Africa",
  Albania: "Europe & Central Asia", "United Arab Emirates": "Middle East & North Africa",
  Argentina: "Latin America & Caribbean", Australia: "East Asia & Pacific",
  Austria: "Europe & Central Asia", Bangladesh: "South Asia",
  Brazil: "Latin America & Caribbean", Canada: "North America",
  China: "East Asia & Pacific", "Democratic Republic of Congo": "Sub-Saharan Africa",
  Germany: "Europe & Central Asia", Egypt: "Middle East & North Africa",
  Ethiopia: "Sub-Saharan Africa", France: "Europe & Central Asia",
  "United Kingdom": "Europe & Central Asia", Ghana: "Sub-Saharan Africa",
  India: "South Asia", Indonesia: "East Asia & Pacific",
  Iran: "Middle East & North Africa", Iraq: "Middle East & North Africa",
  Italy: "Europe & Central Asia", Japan: "East Asia & Pacific",
  Kenya: "Sub-Saharan Africa", "South Korea": "East Asia & Pacific",
  Mexico: "Latin America & Caribbean", Malaysia: "East Asia & Pacific",
  Nigeria: "Sub-Saharan Africa", Pakistan: "South Asia",
  Philippines: "East Asia & Pacific", Poland: "Europe & Central Asia",
  Russia: "Europe & Central Asia", "Saudi Arabia": "Middle East & North Africa",
  Thailand: "East Asia & Pacific", Turkey: "Europe & Central Asia",
  Ukraine: "Europe & Central Asia", "United States": "North America",
  Vietnam: "East Asia & Pacific", "South Africa": "Sub-Saharan Africa",
  Tanzania: "Sub-Saharan Africa", Uganda: "Sub-Saharan Africa",
  Mozambique: "Sub-Saharan Africa", Madagascar: "Sub-Saharan Africa",
  Nepal: "South Asia", Myanmar: "East Asia & Pacific",
  Cambodia: "East Asia & Pacific", "Sri Lanka": "South Asia",
  Colombia: "Latin America & Caribbean", Peru: "Latin America & Caribbean",
  Bolivia: "Latin America & Caribbean", Haiti: "Latin America & Caribbean",
  Senegal: "Sub-Saharan Africa", Mali: "Sub-Saharan Africa",
  Niger: "Sub-Saharan Africa", Chad: "Sub-Saharan Africa",
  "Burkina Faso": "Sub-Saharan Africa", Somalia: "Sub-Saharan Africa",
  Sudan: "Sub-Saharan Africa", Yemen: "Middle East & North Africa",
  Jordan: "Middle East & North Africa", Morocco: "Middle East & North Africa",
};

// Known aggregate entities in OWID data to exclude
const OWID_AGGREGATES = new Set([
  "World", "Africa", "Asia", "Europe", "North America", "South America",
  "Oceania", "High income", "Low income", "Lower middle income",
  "Upper middle income", "European Union", "OECD",
  "Least developed countries", "Sub-Saharan Africa",
  "East Asia and Pacific", "South Asia",
  "Latin America and Caribbean", "Middle East and North Africa",
  "Central and Southern Asia", "Eastern and South-Eastern Asia",
  "Northern Africa and Western Asia", "Landlocked developing countries",
  "Small island developing states",
]);

/**
 * Parse CSV text into array of row objects keyed by header names.
 */
function parseCsv(text: string): Array<Record<string, string>> {
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
 * Fetch and parse the OWID Water and Sanitation CSV.
 * Extracts multiple WASH indicators per row, disaggregated by urban/rural.
 */
export async function fetchOwidData(): Promise<WashRecord[]> {
  const records: WashRecord[] = [];

  const response = await fetchWithTimeout(OWID_WASH_CSV_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OWID WASH CSV: ${response.status}`
    );
  }

  const text = await response.text();
  const rows = parseCsv(text);

  for (const row of rows) {
    const entity = row["Entity"] ?? "";
    const yearStr = row["Year"] ?? "";

    // Skip aggregates and rows without year
    if (!yearStr || OWID_AGGREGATES.has(entity)) continue;
    const yearNum = parseInt(yearStr, 10);
    if (isNaN(yearNum) || yearNum < 2000) continue;

    const region = OWID_COUNTRY_REGION[entity] ?? "";

    for (const ind of OWID_INDICATORS) {
      const valueStr = row[ind.column] ?? "";
      if (!valueStr) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;

      records.push({
        sourceKey: `owid-${entity.replace(/[^a-zA-Z0-9]/g, "_")}-${ind.column}-${yearNum}`,
        title: `${entity}: ${ind.name} (${yearNum})`,
        country: entity,
        countryISO3: "",
        region,
        year: yearNum,
        indicatorName: ind.name,
        indicatorValue: `${value.toFixed(1)}%`,
        sourceOrganization: "Our World in Data",
        datasetName: "Water and Sanitation (WHO WASH, 2021)",
        dataSourceUrl: "https://ourworldindata.org/water-access",
        washService: ind.washService,
        serviceLevel: ind.serviceLevel,
        coveragePercent: value,
        waterSourceType: "",
        urbanRural: ind.urbanRural,
        tags: [ind.washService, ind.serviceLevel, ind.urbanRural, "OWID", "JMP"],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

