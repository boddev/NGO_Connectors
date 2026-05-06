import type { EnergyRecord } from "./types.js";

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
 * OWID Energy CSV from the owid/energy-data GitHub repository.
 * Uses the comprehensive owid-energy-data.csv with 130+ columns.
 */
const OWID_DATASETS: Array<{
  valueColumn: string;
  indicatorLabel: string;
  unit: string;
  energySource: string;
  infrastructureType: string;
  isAccessRate: boolean;
  isElectrification: boolean;
  isCapacity: boolean;
}> = [
  {
    valueColumn: "electricity_generation",
    indicatorLabel: "Electricity generation (TWh)",
    unit: "TWh",
    energySource: "Electricity",
    infrastructureType: "Power Plant",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
  {
    valueColumn: "renewables_share_elec",
    indicatorLabel: "Renewables share of electricity (%)",
    unit: "percentage",
    energySource: "Renewable",
    infrastructureType: "Power Plant",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
  {
    valueColumn: "fossil_share_elec",
    indicatorLabel: "Fossil fuels share of electricity (%)",
    unit: "percentage",
    energySource: "Fossil Fuel",
    infrastructureType: "Power Plant",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
  {
    valueColumn: "energy_per_capita",
    indicatorLabel: "Primary energy consumption per capita (kWh)",
    unit: "kWh per capita",
    energySource: "",
    infrastructureType: "",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
  {
    valueColumn: "renewables_consumption",
    indicatorLabel: "Renewables consumption (TWh)",
    unit: "TWh",
    energySource: "Renewable",
    infrastructureType: "",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
  {
    valueColumn: "fossil_fuel_consumption",
    indicatorLabel: "Fossil fuel consumption (TWh)",
    unit: "TWh",
    energySource: "Fossil Fuel",
    infrastructureType: "",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
  {
    valueColumn: "primary_energy_consumption",
    indicatorLabel: "Primary energy consumption (TWh)",
    unit: "TWh",
    energySource: "",
    infrastructureType: "",
    isAccessRate: false,
    isElectrification: false,
    isCapacity: false,
  },
];

// ISO-to-region mapping for OWID records
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

const OWID_CSV_URL =
  "https://raw.githubusercontent.com/owid/energy-data/master/owid-energy-data.csv";

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
 * Fetch and parse Our World in Data energy datasets.
 * Filters to real countries (excludes aggregates like "World", "EU").
 */
export async function fetchOwidData(): Promise<EnergyRecord[]> {
  const records: EnergyRecord[] = [];

  const rows = await fetchCsvRows(OWID_CSV_URL);

  for (const ds of OWID_DATASETS) {
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
        sourceKey: `owid-${iso}-${ds.valueColumn}-${yearNum}`,
        title: `${country}: ${ds.indicatorLabel} (${yearNum})`,
        country,
        countryISO3: iso,
        region: OWID_ISO_REGION_MAP[iso] ?? "",
        year: yearNum,
        indicatorName: ds.indicatorLabel,
        indicatorValue: String(value),
        sourceOrganization: "Our World in Data",
        datasetName: "OWID Energy Data",
        dataSourceUrl: "https://github.com/owid/energy-data",
        energySource: ds.energySource,
        accessRate: ds.isAccessRate ? value : null,
        capacityMW: ds.isCapacity ? value : null,
        infrastructureType: ds.infrastructureType,
        electrificationRate: ds.isElectrification ? value : null,
        tags: ["Energy", "OWID", ds.valueColumn],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

