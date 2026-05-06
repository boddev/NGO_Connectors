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
 * UNDP Human Development Index data.
 *
 * Downloads the composite indices time-series CSV directly from the UNDP
 * Human Development Report data center. The CSV uses wide format with
 * columns like hdi_1990, hdi_1991, ..., hdi_2023.
 *
 * CSV structure (first row headers):
 *   iso3, country, hdicode, region, hdi_rank_2023, hdi_1990, ..., hdi_2023, ...
 *
 * hdicode values: "Low", "Medium", "High", "Very High"
 */

const UNDP_HDI_URL =
  "https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv";

// Map hdicode to development category
const HDI_CODE_MAP: Record<string, string> = {
  Low: "Low Human Development",
  Medium: "Medium Human Development",
  High: "High Human Development",
  "Very High": "Very High Human Development",
};

// UNDP region code mapping
const UNDP_REGION_MAP: Record<string, string> = {
  SA: "South Asia",
  ECA: "Europe & Central Asia",
  SSA: "Sub-Saharan Africa",
  EAP: "East Asia & Pacific",
  AS: "Arab States",
  LAC: "Latin America & Caribbean",
};

/**
 * Fetch and parse UNDP HDI time-series CSV.
 * Transforms wide-format (year columns) into long-format records.
 */
export async function fetchUndpHdiData(): Promise<EconomicsRecord[]> {
  const response = await fetchWithTimeout(UNDP_HDI_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch UNDP HDI data: ${response.status}`);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const records: EconomicsRecord[] = [];

  // Find all hdi_YYYY columns
  const hdiColumns: Array<{ col: number; year: number }> = [];
  for (let i = 0; i < headers.length; i++) {
    const match = headers[i].match(/^hdi_(\d{4})$/);
    if (match) {
      const year = parseInt(match[1], 10);
      if (year >= 2000) {
        hdiColumns.push({ col: i, year });
      }
    }
  }

  // Find key column indices
  const iso3Col = headers.indexOf("iso3");
  const countryCol = headers.indexOf("country");
  const hdicodeCol = headers.indexOf("hdicode");
  const regionCol = headers.indexOf("region");

  if (iso3Col < 0 || countryCol < 0) {
    console.warn("UNDP HDI CSV: missing iso3 or country columns");
    return [];
  }

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());

    const iso = values[iso3Col] ?? "";
    const country = values[countryCol] ?? "";
    const hdicode = hdicodeCol >= 0 ? (values[hdicodeCol] ?? "") : "";
    const regionCode = regionCol >= 0 ? (values[regionCol] ?? "") : "";

    if (!iso || iso.length !== 3 || !country) continue;

    const devCategory = HDI_CODE_MAP[hdicode] ?? "";
    const region = UNDP_REGION_MAP[regionCode] ?? regionCode;

    for (const hdiCol of hdiColumns) {
      const valueStr = values[hdiCol.col] ?? "";
      if (!valueStr) continue;

      const value = parseFloat(valueStr);
      if (isNaN(value) || value <= 0) continue;

      records.push({
        sourceKey: `undp-${iso}-hdi-${hdiCol.year}`,
        title: `${country}: Human Development Index (${hdiCol.year})`,
        country,
        countryISO3: iso,
        region,
        year: hdiCol.year,
        indicatorName: "Human Development Index (HDI)",
        indicatorValue: String(value),
        sourceOrganization: "UNDP",
        datasetName: "Human Development Report",
        dataSourceUrl: "https://hdr.undp.org/data-center/human-development-index",
        economicIndicator: "Human Development",
        gdpValue: 0,
        giniCoefficient: 0,
        incomeGroup: "",
        developmentCategory: devCategory,
        tags: ["Human Development", "UNDP", "HDI"],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }
  }

  return records;
}

