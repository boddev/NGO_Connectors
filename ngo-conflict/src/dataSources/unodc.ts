import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ConflictRecord } from "./types.js";

/**
 * UNODC Homicide Data.
 *
 * Download CSV from https://dataunodc.un.org/ — select "Intentional Homicide"
 * dataset, export as CSV, and place in the state directory.
 *
 * Expected CSV columns (UNODC export format):
 *   Country, ISO3, Year, Region, Subregion, Rate, Count, Source
 */

interface UnodcRow {
  Country: string;
  ISO3: string;
  Year: string;
  Region: string;
  Subregion: string;
  Rate: string;
  Count: string;
  Source: string;
}

/**
 * Parse UNODC homicide CSV from a local file path.
 * @param csvPath - Path to the UNODC CSV export file
 */
export function parseUnodcCsv(csvPath: string): ConflictRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`UNODC CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as UnodcRow[];

  const records: ConflictRecord[] = [];

  for (const row of rows) {
    const yearStr = row["Year"] ?? "";
    const yearNum = parseInt(yearStr, 10);
    const country = row["Country"] ?? "";
    const iso = (row["ISO3"] ?? "").substring(0, 3).toUpperCase();
    if (!country || isNaN(yearNum)) continue;

    const rate = row["Rate"] ?? "";
    const count = row["Count"] ?? "";
    const rateNum = parseFloat(rate);
    const countNum = parseInt(count, 10) || 0;

    if (!rate && !count) continue;

    records.push({
      sourceKey: `unodc-${iso || country.substring(0, 3)}-homicide-${yearNum}`,
      title: `${country}: Intentional Homicides (${yearNum})`,
      country,
      countryISO3: iso,
      region: row["Region"] ?? "",
      year: yearNum,
      indicatorName: "Intentional homicide rate (per 100,000 population)",
      indicatorValue: `Rate: ${!isNaN(rateNum) ? rateNum.toFixed(1) : "N/A"} per 100k, Count: ${countNum}`,
      sourceOrganization: "UNODC",
      datasetName: "UNODC Intentional Homicide Dataset",
      dataSourceUrl: "https://dataunodc.un.org/",
      eventType: "Intentional Homicide",
      conflictParty: "",
      fatalities: countNum,
      eventDate: `${yearNum}-01-01T00:00:00Z`,
      geoLocation: "",
      conflictDomain: "Crime",
      tags: ["Crime", "Homicide", "UNODC"].filter(Boolean),
      recordType: "indicator",
      lastModified: new Date().toISOString(),
      methodologyNote: row["Source"]
        ? `Data source: ${row["Source"]}. Subregion: ${row["Subregion"] ?? ""}.`
        : "",
    });
  }

  return records;
}

/**
 * Get the default UNODC CSV path from environment or state directory.
 */
export function getUnodcCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "unodc-homicide-export.csv");
}
