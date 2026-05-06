import type { GovernanceRecord } from "./types.js";

/**
 * Transparency International Corruption Perceptions Index (CPI).
 *
 * TI publishes annual CPI data as XLSX files. The direct download URL follows
 * a predictable pattern. For v1 of this connector, CPI data is loaded from a
 * CSV file placed in the state directory. In production, this could be replaced
 * with an automated download-and-parse pipeline or a Blob Storage trigger.
 *
 * Expected CSV columns (from TI CPI export):
 *   Country, ISO3, Region, CPI Score 2023, Rank 2023, ...
 *
 * The download URL for the latest CPI XLSX is:
 *   https://images.transparencycdn.org/images/CPI2023_Global_Results_Trends.xlsx
 */

import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";

interface CpiRow {
  Country: string;
  ISO3: string;
  Region: string;
  [key: string]: string;
}

/**
 * Parse Transparency International CPI CSV from a local file path.
 *
 * The CSV should have columns: Country, ISO3, Region
 * Plus year-specific columns like "CPI Score YYYY" and "Rank YYYY".
 */
export function parseCpiCsv(csvPath: string): GovernanceRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`CPI CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CpiRow[];

  const records: GovernanceRecord[] = [];

  for (const row of rows) {
    const country = row["Country"] ?? "";
    const iso3 = (row["ISO3"] ?? "").substring(0, 3).toUpperCase();
    const region = row["Region"] ?? "";
    if (!country || !iso3) continue;

    // Extract score/rank columns for each available year
    const headers = Object.keys(row);
    const scoreHeaders = headers.filter((h) =>
      /^CPI Score \d{4}$/i.test(h)
    );

    for (const scoreHeader of scoreHeaders) {
      const yearMatch = scoreHeader.match(/(\d{4})/);
      if (!yearMatch) continue;
      const year = parseInt(yearMatch[1], 10);

      const scoreStr = row[scoreHeader] ?? "";
      const score = parseFloat(scoreStr);
      if (isNaN(score)) continue;

      const rankHeader = `Rank ${year}`;
      const rankStr = row[rankHeader] ?? "0";
      const rank = parseInt(rankStr, 10) || 0;

      records.push({
        sourceKey: `cpi-${iso3}-${year}`,
        title: `${country}: Corruption Perceptions Index (${year})`,
        country,
        countryISO3: iso3,
        region,
        year,
        indicatorName: `Corruption Perceptions Index (CPI) ${year}`,
        indicatorValue: `Score: ${score}/100, Rank: ${rank}`,
        sourceOrganization: "Transparency International",
        datasetName: "Corruption Perceptions Index (CPI)",
        dataSourceUrl: "https://www.transparency.org/en/cpi",
        governanceIndicator: "Corruption Perceptions Index",
        indexScore: score,
        indexRank: rank,
        rightsDomain: "Corruption",
        assessmentYear: year,
        tags: ["Corruption", "CPI", "Transparency International"],
        recordType: "indicator",
        lastModified: new Date().toISOString(),
        methodologyNote:
          `CPI scores range from 0 (highly corrupt) to 100 (very clean). ` +
          `Based on ${year} expert assessments and surveys from multiple sources.`,
      });
    }
  }

  return records;
}

/**
 * Get the default CPI CSV path from environment or state directory.
 */
export function getCpiCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "cpi-data.csv");
}
