import type { GovernanceRecord } from "./types.js";

/**
 * Freedom House Freedom in the World data.
 *
 * Freedom House publishes annual ratings as XLSX files. The download URL is:
 *   https://freedomhouse.org/sites/default/files/2024-02/Country_and_Territory_Ratings_and_Statuses_FIW_1973-2024.xlsx
 *
 * For v1 of this connector, Freedom House data is loaded from a CSV file
 * placed in the state directory. In production, this could use an automated
 * download-and-convert pipeline.
 *
 * Expected CSV columns (from FH export):
 *   Country/Territory, Region, C/T, Edition, Status, PR Rating, CL Rating, Total
 *
 * PR = Political Rights rating (1–7, 1 = most free)
 * CL = Civil Liberties rating (1–7, 1 = most free)
 * Status = F (Free), PF (Partly Free), NF (Not Free)
 */

import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";

const FH_STATUS_MAP: Record<string, string> = {
  F: "Free",
  PF: "Partly Free",
  NF: "Not Free",
};

interface FreedomHouseRow {
  "Country/Territory": string;
  Region: string;
  "C/T": string;
  Edition: string;
  Status: string;
  "PR Rating": string;
  "CL Rating": string;
  Total: string;
  [key: string]: string;
}

/**
 * Parse Freedom House CSV from a local file path.
 */
export function parseFreedomHouseCsv(csvPath: string): GovernanceRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`Freedom House CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as FreedomHouseRow[];

  const records: GovernanceRecord[] = [];

  for (const row of rows) {
    const country = row["Country/Territory"] ?? "";
    const editionStr = row["Edition"] ?? "";
    const edition = parseInt(editionStr, 10);
    if (!country || isNaN(edition)) continue;

    // Skip territory entries if desired (C/T = "T")
    const status = row["Status"] ?? "";
    const statusLabel = FH_STATUS_MAP[status] ?? status;
    const prRating = parseInt(row["PR Rating"] ?? "0", 10);
    const clRating = parseInt(row["CL Rating"] ?? "0", 10);
    const totalStr = row["Total"] ?? "0";
    const total = parseInt(totalStr, 10);
    const region = row["Region"] ?? "";

    // Political Rights record
    records.push({
      sourceKey: `fh-pr-${country.replace(/[^a-zA-Z0-9]/g, "_")}-${edition}`,
      title: `${country}: Political Rights Rating (${edition})`,
      country,
      countryISO3: "",
      region,
      year: edition,
      indicatorName: `Freedom in the World — Political Rights (${edition})`,
      indicatorValue: `Rating: ${prRating}/7, Status: ${statusLabel}`,
      sourceOrganization: "Freedom House",
      datasetName: "Freedom in the World",
      dataSourceUrl: "https://freedomhouse.org/report/freedom-world",
      governanceIndicator: "Freedom in the World — Political Rights",
      indexScore: prRating,
      indexRank: 0,
      rightsDomain: "Political Rights",
      assessmentYear: edition,
      tags: ["Political Rights", "Freedom House", statusLabel],
      recordType: "indicator",
      lastModified: new Date().toISOString(),
      methodologyNote:
        `Political Rights rating: 1 (most free) to 7 (least free). ` +
        `Overall status: ${statusLabel}. Aggregate score: ${total}/100.`,
    });

    // Civil Liberties record
    records.push({
      sourceKey: `fh-cl-${country.replace(/[^a-zA-Z0-9]/g, "_")}-${edition}`,
      title: `${country}: Civil Liberties Rating (${edition})`,
      country,
      countryISO3: "",
      region,
      year: edition,
      indicatorName: `Freedom in the World — Civil Liberties (${edition})`,
      indicatorValue: `Rating: ${clRating}/7, Status: ${statusLabel}`,
      sourceOrganization: "Freedom House",
      datasetName: "Freedom in the World",
      dataSourceUrl: "https://freedomhouse.org/report/freedom-world",
      governanceIndicator: "Freedom in the World — Civil Liberties",
      indexScore: clRating,
      indexRank: 0,
      rightsDomain: "Civil Liberties",
      assessmentYear: edition,
      tags: ["Civil Liberties", "Freedom House", statusLabel],
      recordType: "indicator",
      lastModified: new Date().toISOString(),
      methodologyNote:
        `Civil Liberties rating: 1 (most free) to 7 (least free). ` +
        `Overall status: ${statusLabel}. Aggregate score: ${total}/100.`,
    });
  }

  return records;
}

/**
 * Get the default Freedom House CSV path from environment or state directory.
 */
export function getFreedomHouseCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "freedom-house-data.csv");
}
