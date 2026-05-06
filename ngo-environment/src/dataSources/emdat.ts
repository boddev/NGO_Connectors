import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EnvironmentRecord } from "./types.js";

/**
 * EM-DAT disaster data.
 *
 * EM-DAT requires registration at https://public.emdat.be. For v1 of this
 * connector, the data is provided as a CSV file placed in the state directory.
 * In production, this would be replaced with a Blob Storage trigger or an
 * admin HTTP upload endpoint.
 *
 * Expected CSV columns (EM-DAT export format):
 *   DisNo., Year, Disaster Group, Disaster Subgroup, Disaster Type,
 *   Country, ISO, Region, Total Deaths, Total Affected, Total Damages ('000 US$)
 */

const EM_DAT_DOMAIN_MAP: Record<string, string> = {
  "Climatological": "Climate",
  "Geophysical": "Disasters",
  "Hydrological": "Water",
  "Meteorological": "Climate",
  "Biological": "Biodiversity",
  "Extra-terrestrial": "Disasters",
};

interface EmDatRow {
  "DisNo.": string;
  Year: string;
  "Disaster Group": string;
  "Disaster Subgroup": string;
  "Disaster Type": string;
  Country: string;
  ISO: string;
  Region: string;
  "Total Deaths": string;
  "Total Affected": string;
  "Total Damages ('000 US$)": string;
}

/**
 * Parse EM-DAT CSV from a local file path.
 * @param csvPath - Path to the EM-DAT CSV export file
 */
export function parseEmDatCsv(csvPath: string): EnvironmentRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`EM-DAT CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as EmDatRow[];

  const records: EnvironmentRecord[] = [];

  for (const row of rows) {
    const disNo = (row["DisNo."] ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const yearStr = row["Year"] ?? "";
    const yearNum = parseInt(yearStr, 10);
    if (!disNo || isNaN(yearNum)) continue;

    const iso = (row["ISO"] ?? "").substring(0, 3).toUpperCase();
    const deaths = row["Total Deaths"] ?? "0";
    const affected = row["Total Affected"] ?? "0";
    const damages = row["Total Damages ('000 US$)"] ?? "0";
    const disasterType = row["Disaster Type"] ?? "Unknown";
    const subgroup = row["Disaster Subgroup"] ?? "";
    const domain = EM_DAT_DOMAIN_MAP[subgroup] ?? "Disasters";

    records.push({
      sourceKey: `emdat-${disNo}`,
      title: `${row["Country"] ?? "Unknown"}: ${disasterType} (${yearNum})`,
      country: row["Country"] ?? "Unknown",
      countryISO3: iso,
      region: row["Region"] ?? "",
      year: yearNum,
      indicatorName: `Disaster Event: ${disasterType}`,
      indicatorValue: `Deaths: ${deaths}, Affected: ${affected}, Damages: $${damages}k`,
      measureUnit: "event",
      sourceOrganization: "CRED/EM-DAT",
      datasetName: "EM-DAT International Disaster Database",
      dataSourceUrl: "https://public.emdat.be/data",
      environmentalDomain: domain,
      emissionType: "",
      speciesName: "",
      conservationStatus: "",
      tags: ["Disasters", disasterType, subgroup].filter(Boolean),
      recordType: "disaster",
      lastModified: new Date().toISOString(),
      methodologyNote: `Disaster No: ${row["DisNo."] ?? disNo}. ` +
        `Group: ${row["Disaster Group"] ?? ""}. ` +
        `Subgroup: ${subgroup}. ` +
        `Type: ${disasterType}.`,
    });
  }

  return records;
}

/**
 * Get the default EM-DAT CSV path from environment or state directory.
 */
export function getEmDatCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "emdat-export.csv");
}
