import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import type { NonprofitRecord } from "./types.js";

/**
 * UK Charity Commission data.
 *
 * The Charity Commission publishes bulk data downloads at:
 *   https://register-of-charities.charitycommission.gov.uk/sector-data/top-10-charities
 *
 * For this connector, the data is provided as a CSV file placed in the state directory.
 * In production, this would be automated with a scheduled download from the register.
 *
 * Expected CSV columns (Charity Commission extract format):
 *   charity_number, charity_name, date_of_registration, date_of_removal,
 *   charity_activities, charity_objects, total_income, total_expenditure,
 *   charity_contact_address1, charity_contact_postcode
 */

interface UkCharityRow {
  charity_number: string;
  charity_name: string;
  date_of_registration: string;
  date_of_removal: string;
  charity_activities: string;
  charity_objects: string;
  total_income: string;
  total_expenditure: string;
  charity_contact_address1: string;
  charity_contact_postcode: string;
}

/**
 * Parse UK Charity Commission CSV from a local file path.
 * @param csvPath - Path to the Charity Commission CSV export file
 */
export function parseUkCharityCsv(csvPath: string): NonprofitRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`UK Charity Commission CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as UkCharityRow[];

  const records: NonprofitRecord[] = [];

  for (const row of rows) {
    const charityNumber = (row.charity_number ?? "").trim();
    if (!charityNumber) continue;

    // Skip removed charities
    if (row.date_of_removal && row.date_of_removal.trim() !== "") continue;

    const name = (row.charity_name ?? "").trim();
    const income = parseFloat(row.total_income ?? "0") || 0;
    const expenditure = parseFloat(row.total_expenditure ?? "0") || 0;
    const activities = (row.charity_activities ?? "").trim();
    const objects = (row.charity_objects ?? "").trim();
    const mission = objects || activities;

    const tags: string[] = ["UK Charity", "Charity Commission"];
    if (activities) {
      // Extract broad category from activities text
      if (/education|school|training/i.test(activities)) tags.push("Education");
      if (/health|medical|hospital/i.test(activities)) tags.push("Health");
      if (/environment|conservation|wildlife/i.test(activities))
        tags.push("Environment");
      if (/poverty|relief|humanitarian/i.test(activities))
        tags.push("Humanitarian");
      if (/arts|culture|heritage/i.test(activities))
        tags.push("Arts & Culture");
      if (/children|youth|young/i.test(activities))
        tags.push("Children & Youth");
    }

    records.push({
      sourceKey: `ukcc-${charityNumber}`,
      title: `${name} (UK Charity: ${charityNumber})`,
      country: "United Kingdom",
      region: "United Kingdom",
      year: new Date().getFullYear(),
      indicatorName: "UK Charity Registration",
      indicatorValue:
        income > 0
          ? `Income: £${formatGbp(income)}`
          : "Financial data not available",
      sourceOrganization: "UK Charity Commission",
      datasetName: "UK Charity Commission Register",
      dataSourceUrl: `https://register-of-charities.charitycommission.gov.uk/charity-search/-/charity-details/${charityNumber}`,
      organizationName: name,
      ein: charityNumber,
      totalRevenue: income,
      totalExpenses: expenditure,
      missionStatement: mission.substring(0, 500),
      charityRating: 0,
      tags,
      recordType: "organization",
      lastModified: new Date().toISOString(),
      contextNote: buildUkCharityContext(row),
    });
  }

  return records;
}

function formatGbp(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}K`;
  return String(Math.round(amount));
}

function buildUkCharityContext(row: UkCharityRow): string {
  const lines: string[] = [];
  if (row.date_of_registration)
    lines.push(`Registered: ${row.date_of_registration}`);
  if (row.total_income)
    lines.push(`Total Income: £${parseFloat(row.total_income).toLocaleString()}`);
  if (row.total_expenditure)
    lines.push(
      `Total Expenditure: £${parseFloat(row.total_expenditure).toLocaleString()}`
    );
  if (row.charity_contact_postcode)
    lines.push(`Postcode: ${row.charity_contact_postcode}`);
  if (row.charity_activities)
    lines.push(`Activities: ${row.charity_activities.substring(0, 300)}`);
  return lines.join(". ");
}

/**
 * Get the default UK Charity Commission CSV path from environment or state directory.
 */
export function getUkCharityCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "uk-charity-commission.csv");
}
