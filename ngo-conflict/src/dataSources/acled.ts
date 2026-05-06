import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ConflictRecord } from "./types.js";

/**
 * ACLED conflict event data.
 *
 * ACLED requires registration at https://developer.acleddata.com for API access.
 * For v1, data is provided as a CSV export placed in the state directory.
 * Register and export from https://acleddata.com/data-export-tool/
 *
 * Expected CSV columns (ACLED export format):
 *   data_id, iso, event_date, year, event_type, sub_event_type,
 *   actor1, actor2, country, admin1, admin2, location,
 *   latitude, longitude, fatalities, notes, source
 */

const ACLED_DOMAIN_MAP: Record<string, string> = {
  "Battles": "Armed Conflict",
  "Violence against civilians": "Political Violence",
  "Explosions/Remote violence": "Armed Conflict",
  "Riots": "Protests",
  "Protests": "Protests",
  "Strategic developments": "Armed Conflict",
};

interface AcledRow {
  data_id: string;
  iso: string;
  event_date: string;
  year: string;
  event_type: string;
  sub_event_type: string;
  actor1: string;
  actor2: string;
  country: string;
  admin1: string;
  admin2: string;
  location: string;
  latitude: string;
  longitude: string;
  fatalities: string;
  notes: string;
  source: string;
}

/**
 * Parse ACLED CSV from a local file path.
 * @param csvPath - Path to the ACLED CSV export file
 */
export function parseAcledCsv(csvPath: string): ConflictRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`ACLED CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as AcledRow[];

  const records: ConflictRecord[] = [];

  for (const row of rows) {
    const dataId = (row["data_id"] ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const yearStr = row["year"] ?? "";
    const yearNum = parseInt(yearStr, 10);
    if (!dataId || isNaN(yearNum)) continue;

    const iso = (row["iso"] ?? "").substring(0, 3).toUpperCase();
    const eventType = row["event_type"] ?? "Unknown";
    const fatalities = parseInt(row["fatalities"] ?? "0", 10) || 0;
    const domain = ACLED_DOMAIN_MAP[eventType] ?? "Political Violence";
    const actor1 = row["actor1"] ?? "";
    const actor2 = row["actor2"] ?? "";
    const conflictParty = [actor1, actor2].filter(Boolean).join(" vs ");
    const location = row["location"] ?? "";
    const admin1 = row["admin1"] ?? "";
    const lat = row["latitude"] ?? "";
    const lon = row["longitude"] ?? "";
    const geoLocation = [location, admin1]
      .filter(Boolean)
      .join(", ") + (lat && lon ? ` (${lat}, ${lon})` : "");

    // Parse event_date to ISO 8601
    let eventDate: string;
    try {
      const parsed = new Date(row["event_date"] ?? "");
      eventDate = isNaN(parsed.getTime())
        ? `${yearNum}-01-01T00:00:00Z`
        : parsed.toISOString();
    } catch {
      eventDate = `${yearNum}-01-01T00:00:00Z`;
    }

    records.push({
      sourceKey: `acled-${dataId}`,
      title: `${row["country"] ?? "Unknown"}: ${eventType} — ${location} (${row["event_date"] ?? yearStr})`,
      country: row["country"] ?? "Unknown",
      countryISO3: iso,
      region: "",
      year: yearNum,
      indicatorName: `Conflict Event: ${eventType}`,
      indicatorValue: `Fatalities: ${fatalities}`,
      sourceOrganization: "ACLED",
      datasetName: "Armed Conflict Location & Event Data",
      dataSourceUrl: "https://acleddata.com/data-export-tool/",
      eventType,
      conflictParty,
      fatalities,
      eventDate,
      geoLocation,
      conflictDomain: domain,
      tags: [domain, eventType, "ACLED"].filter(Boolean),
      recordType: "event",
      lastModified: new Date().toISOString(),
      methodologyNote: row["notes"] ?? "",
    });
  }

  return records;
}

/**
 * Get the default ACLED CSV path from environment or state directory.
 */
export function getAcledCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "acled-export.csv");
}
