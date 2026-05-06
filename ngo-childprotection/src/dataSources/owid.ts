import type { ChildProtectionRecord } from "./types.js";

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
 * OWID datasets hosted on GitHub for child protection & welfare.
 * Uses the legacy owid-datasets repo which provides stable CSV files.
 */
const OWID_DATASETS: Array<{
  url: string;
  name: string;
  issue: string;
  domain: string;
  ageRange: string;
  /** Column mapping: which CSV column holds the value */
  valueColumn: string;
  unit: string;
  indicatorLabel: string;
}> = [
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Under%205%20mortality%20rate%20%5BOur%20World%20in%20Data%5D/Under%205%20mortality%20rate%20%5BOur%20World%20in%20Data%5D.csv",
    name: "Under-5 Mortality Rate (OWID)",
    issue: "Child Mortality",
    domain: "Health",
    ageRange: "Under 5",
    valueColumn: "Under 5 mortality rate [Our World in Data]",
    unit: "per 1,000 live births",
    indicatorLabel: "Under-5 mortality rate",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Youth%20Mortality%20Rates%20-%20UN%20IGME%20(2021)/Youth%20Mortality%20Rates%20-%20UN%20IGME%20(2021).csv",
    name: "Youth Mortality Rates — UN IGME (2021)",
    issue: "Child Mortality",
    domain: "Health",
    ageRange: "Under 15",
    valueColumn: "Under-five mortality rate",
    unit: "per 1,000 live births",
    indicatorLabel: "Under-five mortality rate (UN IGME)",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Youth%20Mortality%20Rates%20-%20UN%20IGME%20(2021)/Youth%20Mortality%20Rates%20-%20UN%20IGME%20(2021).csv",
    name: "Youth Mortality Rates — UN IGME (2021)",
    issue: "Child Mortality",
    domain: "Health",
    ageRange: "Under 1",
    valueColumn: "Infant mortality rate",
    unit: "per 1,000 live births",
    indicatorLabel: "Infant mortality rate (UN IGME)",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Youth%20Mortality%20Rates%20-%20UN%20IGME%20(2021)/Youth%20Mortality%20Rates%20-%20UN%20IGME%20(2021).csv",
    name: "Youth Mortality Rates — UN IGME (2021)",
    issue: "Child Mortality",
    domain: "Health",
    ageRange: "Under 1",
    valueColumn: "Neonatal mortality rate",
    unit: "per 1,000 live births",
    indicatorLabel: "Neonatal mortality rate (UN IGME)",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Child%20Labor%20(World%20ILO)%20-%20ILO%20(2017)/Child%20Labor%20(World%20ILO)%20-%20ILO%20(2017).csv",
    name: "Child Labor (World ILO) — ILO (2017)",
    issue: "Child Labor",
    domain: "Labour",
    ageRange: "5-14",
    valueColumn: "Child labor (incidence) (ILO)",
    unit: "number of children",
    indicatorLabel: "Child labor incidence (ILO global estimate)",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Number%20of%20children%20who%20are%20stunted%20(OWID%20based%20on%20UNICEF!WHO)/Number%20of%20children%20who%20are%20stunted%20(OWID%20based%20on%20UNICEF!WHO).csv",
    name: "Children who are stunted (OWID/UNICEF/WHO)",
    issue: "Child Nutrition",
    domain: "Health",
    ageRange: "Under 5",
    valueColumn: "Number of children who are stunted",
    unit: "number of children",
    indicatorLabel: "Number of stunted children (UNICEF/WHO)",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Child%20Mortality%20Estimates%20-%20CME%20Info%20(2018)/Child%20Mortality%20Estimates%20-%20CME%20Info%20(2018).csv",
    name: "Child Mortality Estimates — CME Info (2018)",
    issue: "Child Mortality",
    domain: "Health",
    ageRange: "Under 5",
    valueColumn: "Child Mortality Estimates (CME Info (2016))",
    unit: "per 1,000 live births",
    indicatorLabel: "Child mortality rate (CME Info)",
  },
];

// ISO3 to region mapping for OWID data (Entity column has country names)
const OWID_COUNTRY_REGION_MAP: Record<string, string> = {
  "Afghanistan": "South Asia",
  "Angola": "Sub-Saharan Africa",
  "Albania": "Europe & Central Asia",
  "United Arab Emirates": "Middle East & North Africa",
  "Argentina": "Latin America & Caribbean",
  "Australia": "East Asia & Pacific",
  "Austria": "Europe & Central Asia",
  "Bangladesh": "South Asia",
  "Brazil": "Latin America & Caribbean",
  "Canada": "North America",
  "China": "East Asia & Pacific",
  "Colombia": "Latin America & Caribbean",
  "Democratic Republic of Congo": "Sub-Saharan Africa",
  "Germany": "Europe & Central Asia",
  "Egypt": "Middle East & North Africa",
  "Ethiopia": "Sub-Saharan Africa",
  "France": "Europe & Central Asia",
  "United Kingdom": "Europe & Central Asia",
  "Ghana": "Sub-Saharan Africa",
  "India": "South Asia",
  "Indonesia": "East Asia & Pacific",
  "Iran": "Middle East & North Africa",
  "Iraq": "Middle East & North Africa",
  "Italy": "Europe & Central Asia",
  "Japan": "East Asia & Pacific",
  "Kenya": "Sub-Saharan Africa",
  "South Korea": "East Asia & Pacific",
  "Mexico": "Latin America & Caribbean",
  "Malaysia": "East Asia & Pacific",
  "Mozambique": "Sub-Saharan Africa",
  "Nigeria": "Sub-Saharan Africa",
  "Pakistan": "South Asia",
  "Peru": "Latin America & Caribbean",
  "Philippines": "East Asia & Pacific",
  "Poland": "Europe & Central Asia",
  "Russia": "Europe & Central Asia",
  "Saudi Arabia": "Middle East & North Africa",
  "South Africa": "Sub-Saharan Africa",
  "Sri Lanka": "South Asia",
  "Tanzania": "Sub-Saharan Africa",
  "Thailand": "East Asia & Pacific",
  "Turkey": "Europe & Central Asia",
  "Uganda": "Sub-Saharan Africa",
  "Ukraine": "Europe & Central Asia",
  "United States": "North America",
  "Vietnam": "East Asia & Pacific",
  "Zambia": "Sub-Saharan Africa",
  "Zimbabwe": "Sub-Saharan Africa",
};

// Known aggregate entity names to exclude from OWID data
const OWID_AGGREGATE_ENTITIES = new Set([
  "World",
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "European Union",
  "High-income countries",
  "Low-income countries",
  "Lower-middle-income countries",
  "Upper-middle-income countries",
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

  // Handle quoted headers (e.g., "Column Name")
  const headers = parseCSVLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }

  return rows;
}

/** Simple CSV line parser that handles quoted fields. */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Fetch and parse Our World in Data child protection datasets.
 * Filters to real countries (excludes aggregates like "World", "EU").
 */
export async function fetchOwidData(): Promise<ChildProtectionRecord[]> {
  const records: ChildProtectionRecord[] = [];
  const csvCache = new Map<string, Array<Record<string, string>>>();

  for (const ds of OWID_DATASETS) {
    let rows: Array<Record<string, string>>;

    // Cache CSV downloads to avoid re-fetching the same URL
    if (csvCache.has(ds.url)) {
      rows = csvCache.get(ds.url)!;
    } else {
      try {
        rows = await fetchCsvRows(ds.url);
        csvCache.set(ds.url, rows);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to fetch OWID dataset ${ds.name}: ${msg}`);
        continue;
      }
    }

    for (const row of rows) {
      const entity = row["Entity"] ?? "";
      const yearStr = row["Year"] ?? "";
      const valueStr = row[ds.valueColumn] ?? "";

      // Skip aggregates and rows without data
      if (!entity || !yearStr || !valueStr) continue;
      if (OWID_AGGREGATE_ENTITIES.has(entity)) continue;

      const yearNum = parseInt(yearStr, 10);
      if (isNaN(yearNum) || yearNum < 2000) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;

      const region = OWID_COUNTRY_REGION_MAP[entity] ?? "";
      const sourceKey = `owid-${entity.replace(/[^a-zA-Z0-9]/g, "_")}-${ds.valueColumn.replace(/[^a-zA-Z0-9]/g, "_").substring(0, 40)}-${yearNum}`;

      records.push({
        sourceKey,
        title: `${entity}: ${ds.indicatorLabel} (${yearNum})`,
        country: entity,
        countryISO3: "",
        region,
        year: yearNum,
        indicatorName: ds.indicatorLabel,
        indicatorValue: String(value),
        sourceOrganization: "Our World in Data",
        datasetName: ds.name,
        dataSourceUrl: "https://ourworldindata.org/child-mortality",
        childProtectionIssue: ds.issue,
        ageRange: ds.ageRange,
        prevalenceRate: value,
        legalProtection: false,
        childWelfareDomain: ds.domain,
        tags: [ds.domain, ds.issue, "OWID"],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

