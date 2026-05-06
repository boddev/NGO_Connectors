import type { EducationRecord } from "./types.js";

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
 * OWID CSV datasets from the archived owid-datasets GitHub repository.
 * These CSVs use Entity/Year columns (no ISO codes).
 */
const OWID_DATASETS: Array<{
  url: string;
  name: string;
  domain: string;
  /** Column name holding the value (exact match required) */
  valueColumn: string;
  unit: string;
  indicatorLabel: string;
  educationLevel: string;
}> = [
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Cross-country%20literacy%20rates%20-%20World%20Bank%2C%20CIA%20World%20Factbook%2C%20and%20other%20sources/Cross-country%20literacy%20rates%20-%20World%20Bank%2C%20CIA%20World%20Factbook%2C%20and%20other%20sources.csv",
    name: "OWID Cross-country Literacy Rates",
    domain: "Literacy",
    valueColumn: "Literacy rates (World Bank, CIA World Factbook, and other sources)",
    unit: "percentage",
    indicatorLabel: "Cross-country literacy rate",
    educationLevel: "",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Expected%20Years%20of%20Schooling%20-%20UNDP%20(2018)/Expected%20Years%20of%20Schooling%20-%20UNDP%20(2018).csv",
    name: "OWID Expected Years of Schooling (UNDP)",
    domain: "Access",
    valueColumn: "Expected Years of Schooling (years)",
    unit: "years",
    indicatorLabel: "Expected years of schooling",
    educationLevel: "",
  },
  {
    url: "https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/Learning-Adjusted%20Years%20of%20Schooling%20-%20World%20Bank%20(2018)/Learning-Adjusted%20Years%20of%20Schooling%20-%20World%20Bank%20(2018).csv",
    name: "OWID Learning-Adjusted Years of Schooling",
    domain: "Quality",
    valueColumn: "Learning-Adjusted Years of School",
    unit: "years",
    indicatorLabel: "Learning-adjusted years of schooling",
    educationLevel: "",
  },
];

// Map country names to ISO-3 codes (OWID archived datasets use Entity names, not ISO codes)
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "Afghanistan": "AFG", "Albania": "ALB", "Algeria": "DZA", "Angola": "AGO",
  "Argentina": "ARG", "Armenia": "ARM", "Australia": "AUS", "Austria": "AUT",
  "Azerbaijan": "AZE", "Bangladesh": "BGD", "Belarus": "BLR", "Belgium": "BEL",
  "Benin": "BEN", "Bolivia": "BOL", "Bosnia and Herzegovina": "BIH",
  "Botswana": "BWA", "Brazil": "BRA", "Bulgaria": "BGR", "Burkina Faso": "BFA",
  "Burundi": "BDI", "Cambodia": "KHM", "Cameroon": "CMR", "Canada": "CAN",
  "Central African Republic": "CAF", "Chad": "TCD", "Chile": "CHL",
  "China": "CHN", "Colombia": "COL", "Comoros": "COM",
  "Congo": "COG", "Costa Rica": "CRI", "Cote d'Ivoire": "CIV",
  "Croatia": "HRV", "Cuba": "CUB", "Cyprus": "CYP",
  "Czech Republic": "CZE", "Czechia": "CZE",
  "Democratic Republic of Congo": "COD",
  "Denmark": "DNK", "Dominican Republic": "DOM", "Ecuador": "ECU",
  "Egypt": "EGY", "El Salvador": "SLV", "Eritrea": "ERI", "Estonia": "EST",
  "Eswatini": "SWZ", "Ethiopia": "ETH", "Finland": "FIN", "France": "FRA",
  "Gabon": "GAB", "Gambia": "GMB", "Georgia": "GEO", "Germany": "DEU",
  "Ghana": "GHA", "Greece": "GRC", "Guatemala": "GTM", "Guinea": "GIN",
  "Guinea-Bissau": "GNB", "Haiti": "HTI", "Honduras": "HND", "Hungary": "HUN",
  "India": "IND", "Indonesia": "IDN", "Iran": "IRN", "Iraq": "IRQ",
  "Ireland": "IRL", "Israel": "ISR", "Italy": "ITA", "Jamaica": "JAM",
  "Japan": "JPN", "Jordan": "JOR", "Kazakhstan": "KAZ", "Kenya": "KEN",
  "Kuwait": "KWT", "Kyrgyzstan": "KGZ", "Laos": "LAO", "Latvia": "LVA",
  "Lebanon": "LBN", "Lesotho": "LSO", "Liberia": "LBR", "Libya": "LBY",
  "Lithuania": "LTU", "Luxembourg": "LUX", "Madagascar": "MDG",
  "Malawi": "MWI", "Malaysia": "MYS", "Mali": "MLI", "Mauritania": "MRT",
  "Mauritius": "MUS", "Mexico": "MEX", "Moldova": "MDA", "Mongolia": "MNG",
  "Morocco": "MAR", "Mozambique": "MOZ", "Myanmar": "MMR", "Namibia": "NAM",
  "Nepal": "NPL", "Netherlands": "NLD", "New Zealand": "NZL",
  "Nicaragua": "NIC", "Niger": "NER", "Nigeria": "NGA", "North Macedonia": "MKD",
  "Norway": "NOR", "Oman": "OMN", "Pakistan": "PAK", "Panama": "PAN",
  "Papua New Guinea": "PNG", "Paraguay": "PRY", "Peru": "PER",
  "Philippines": "PHL", "Poland": "POL", "Portugal": "PRT", "Qatar": "QAT",
  "Romania": "ROU", "Russia": "RUS", "Rwanda": "RWA",
  "Saudi Arabia": "SAU", "Senegal": "SEN", "Serbia": "SRB",
  "Sierra Leone": "SLE", "Singapore": "SGP", "Slovakia": "SVK",
  "Slovenia": "SVN", "Somalia": "SOM", "South Africa": "ZAF",
  "South Korea": "KOR", "South Sudan": "SSD", "Spain": "ESP",
  "Sri Lanka": "LKA", "Sudan": "SDN", "Sweden": "SWE", "Switzerland": "CHE",
  "Syria": "SYR", "Tajikistan": "TJK", "Tanzania": "TZA", "Thailand": "THA",
  "Togo": "TGO", "Trinidad and Tobago": "TTO", "Tunisia": "TUN",
  "Turkey": "TUR", "Turkmenistan": "TKM", "Uganda": "UGA", "Ukraine": "UKR",
  "United Arab Emirates": "ARE", "United Kingdom": "GBR",
  "United States": "USA", "Uruguay": "URY", "Uzbekistan": "UZB",
  "Venezuela": "VEN", "Vietnam": "VNM", "Yemen": "YEM", "Zambia": "ZMB",
  "Zimbabwe": "ZWE",
};

// Map ISO-3 codes to World Bank regions
const ISO_REGION_MAP: Record<string, string> = {
  AFG: "South Asia", AGO: "Sub-Saharan Africa", ALB: "Europe & Central Asia",
  ARE: "Middle East & North Africa", ARG: "Latin America & Caribbean",
  AUS: "East Asia & Pacific", AUT: "Europe & Central Asia",
  BGD: "South Asia", BRA: "Latin America & Caribbean", CAN: "North America",
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
 * Parse a CSV string into an array of objects keyed by header columns.
 * Handles quoted fields containing commas.
 */
function parseCsvText(text: string): Array<Record<string, string>> {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

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

/** Parse a single CSV line, respecting quoted fields. */
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
 * Fetch and parse Our World in Data education datasets.
 * Filters to real countries (excludes aggregates like "World", "EU").
 */
export async function fetchOwidData(): Promise<EducationRecord[]> {
  const records: EducationRecord[] = [];

  for (const ds of OWID_DATASETS) {
    let rows: Array<Record<string, string>>;
    try {
      const response = await fetchWithTimeout(ds.url);
      if (!response.ok) {
        console.warn(`OWID fetch failed for ${ds.name}: ${response.status}`);
        continue;
      }
      const text = await response.text();
      rows = parseCsvText(text);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`OWID fetch error for ${ds.name}: ${msg}`);
      continue;
    }

    for (const row of rows) {
      const entity = row["Entity"] ?? "";
      const yearStr = row["Year"] ?? "";
      const valueStr = row[ds.valueColumn] ?? "";

      // Look up ISO code from entity name
      const iso = COUNTRY_NAME_TO_ISO[entity];
      if (!iso) continue; // Skip aggregates and unknown entities

      if (!yearStr || !valueStr) continue;
      const yearNum = parseInt(yearStr, 10);
      if (isNaN(yearNum) || yearNum < 2000) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value)) continue;

      const isLiteracy = ds.domain === "Literacy";

      records.push({
        sourceKey: `owid-${iso}-${ds.valueColumn.substring(0, 30).replace(/[^a-zA-Z0-9]/g, "_")}-${yearNum}`,
        title: `${entity}: ${ds.indicatorLabel} (${yearNum})`,
        country: entity,
        countryISO3: iso,
        region: ISO_REGION_MAP[iso] ?? "",
        year: yearNum,
        indicatorName: ds.indicatorLabel,
        indicatorValue: String(value),
        measureUnit: ds.unit,
        sourceOrganization: "Our World in Data",
        datasetName: ds.name,
        dataSourceUrl: "https://github.com/owid/owid-datasets",
        educationLevel: ds.educationLevel,
        enrollmentType: "",
        genderParity: 0,
        literacyRate: isLiteracy ? value : 0,
        educationDomain: ds.domain,
        tags: [ds.domain, "OWID", ds.indicatorLabel],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

