import { parse } from "csv-parse/sync";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ConflictRecord } from "./types.js";

/**
 * UCDP Georeferenced Event Dataset (GED).
 *
 * Annual CSV downloads available from https://ucdp.uu.se/downloads/
 * Downloads are ZIP files; extract the CSV and place in the state directory.
 *
 * Expected CSV columns (UCDP GED format):
 *   id, year, active_year, type_of_violence, conflict_name,
 *   side_a, side_b, country, region, latitude, longitude,
 *   best, high, low, date_start, date_end, source_article
 *
 * type_of_violence: 1 = state-based, 2 = non-state, 3 = one-sided
 */

const VIOLENCE_TYPE_MAP: Record<string, string> = {
  "1": "State-based conflict",
  "2": "Non-state conflict",
  "3": "One-sided violence",
};

const VIOLENCE_DOMAIN_MAP: Record<string, string> = {
  "1": "Armed Conflict",
  "2": "Armed Conflict",
  "3": "Political Violence",
};

interface UcdpRow {
  id: string;
  year: string;
  active_year: string;
  type_of_violence: string;
  conflict_name: string;
  side_a: string;
  side_b: string;
  country: string;
  region: string;
  latitude: string;
  longitude: string;
  best: string;
  high: string;
  low: string;
  date_start: string;
  date_end: string;
  source_article: string;
}

/**
 * Parse UCDP GED CSV from a local file path.
 * @param csvPath - Path to the UCDP GED CSV file
 */
export function parseUcdpCsv(csvPath: string): ConflictRecord[] {
  if (!fs.existsSync(csvPath)) {
    console.warn(`UCDP CSV not found at ${csvPath}. Skipping.`);
    return [];
  }

  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as UcdpRow[];

  const records: ConflictRecord[] = [];

  for (const row of rows) {
    const eventId = (row["id"] ?? "").replace(/[^a-zA-Z0-9_-]/g, "_");
    const yearStr = row["year"] ?? "";
    const yearNum = parseInt(yearStr, 10);
    if (!eventId || isNaN(yearNum)) continue;

    const violenceType = row["type_of_violence"] ?? "";
    const eventType = VIOLENCE_TYPE_MAP[violenceType] ?? "Unknown conflict type";
    const domain = VIOLENCE_DOMAIN_MAP[violenceType] ?? "Armed Conflict";
    const sideA = row["side_a"] ?? "";
    const sideB = row["side_b"] ?? "";
    const conflictParty = [sideA, sideB].filter(Boolean).join(" vs ");
    const bestEstimate = parseInt(row["best"] ?? "0", 10) || 0;
    const lat = row["latitude"] ?? "";
    const lon = row["longitude"] ?? "";
    const geoLocation = lat && lon ? `${lat}, ${lon}` : "";
    const conflictName = row["conflict_name"] ?? "";

    // Parse date_start to ISO 8601
    let eventDate: string;
    try {
      const parsed = new Date(row["date_start"] ?? "");
      eventDate = isNaN(parsed.getTime())
        ? `${yearNum}-01-01T00:00:00Z`
        : parsed.toISOString();
    } catch {
      eventDate = `${yearNum}-01-01T00:00:00Z`;
    }

    records.push({
      sourceKey: `ucdp-${eventId}`,
      title: `${row["country"] ?? "Unknown"}: ${conflictName || eventType} (${yearStr})`,
      country: row["country"] ?? "Unknown",
      countryISO3: "",
      region: row["region"] ?? "",
      year: yearNum,
      indicatorName: `${eventType}: ${conflictName}`,
      indicatorValue: `Best estimate fatalities: ${bestEstimate} (low: ${row["low"] ?? "0"}, high: ${row["high"] ?? "0"})`,
      sourceOrganization: "UCDP",
      datasetName: "UCDP Georeferenced Event Dataset (GED)",
      dataSourceUrl: "https://ucdp.uu.se/downloads/",
      eventType,
      conflictParty,
      fatalities: bestEstimate,
      eventDate,
      geoLocation,
      conflictDomain: domain,
      tags: [domain, eventType, "UCDP"].filter(Boolean),
      recordType: "event",
      lastModified: new Date().toISOString(),
      methodologyNote: row["source_article"] ?? "",
    });
  }

  return records;
}

/**
 * Get the default UCDP CSV path from environment or state directory.
 */
export function getUcdpCsvPath(): string {
  const stateDir = process.env.CONNECTOR_STATE_PATH ?? "./state";
  return path.join(stateDir, "ucdp-ged-export.csv");
}
