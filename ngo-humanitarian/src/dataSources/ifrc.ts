import type { HumanitarianRecord } from "./types.js";

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
 * IFRC GO API v2 — emergency events and appeals.
 * Public API, no authentication required.
 * Endpoint: https://goadmin.ifrc.org/api/v2/
 */

interface IfrcEventResponse {
  count: number;
  next: string | null;
  results: IfrcEvent[];
}

interface IfrcEvent {
  id: number;
  name: string;
  slug: string;
  dtype: { id: number; name: string } | null;
  countries: Array<{
    name: string;
    iso3: string;
    region: number;
    society_name: string;
  }>;
  num_affected: number | null;
  ifrc_severity_level: number | null;
  ifrc_severity_level_display: string;
  disaster_start_date: string | null;
  created_at: string;
  updated_at: string;
  summary: string;
  appeals: IfrcAppealSummary[];
  active_deployments: number;
}

interface IfrcAppealSummary {
  aid: string;
  name: string;
  atype: number;
  status: number;
  status_display: string;
  num_beneficiaries: number;
  amount_requested: number;
  amount_funded: number;
}

interface IfrcAppealResponse {
  count: number;
  next: string | null;
  results: IfrcAppeal[];
}

interface IfrcAppeal {
  id: number;
  aid: string;
  name: string;
  dtype: { id: number; name: string } | null;
  atype: number;
  atype_display: string;
  status: number;
  status_display: string;
  num_beneficiaries: number;
  amount_requested: number;
  amount_funded: number;
  start_date: string;
  end_date: string;
  created_at: string;
  modified_at: string;
  country: {
    name: string;
    iso3: string;
    region: number;
    society_name: string;
  } | null;
  region: { name: string } | null;
}

const SEVERITY_MAP: Record<number, string> = {
  0: "Monitoring",
  1: "Active",
  2: "Active",
  3: "Active",
  4: "Active",
  5: "Active",
};

/**
 * Fetch emergency events from the IFRC GO API.
 */
export async function fetchIfrcEvents(
  maxRecords = 300
): Promise<HumanitarianRecord[]> {
  const records: HumanitarianRecord[] = [];
  let url: string | null =
    "https://goadmin.ifrc.org/api/v2/event/?limit=50&format=json&ordering=-disaster_start_date";

  while (url && records.length < maxRecords) {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.warn(`IFRC GO events API error: ${response.status}`);
      break;
    }

    const json = (await response.json()) as IfrcEventResponse;
    if (!json.results || json.results.length === 0) break;

    for (const event of json.results) {
      if (records.length >= maxRecords) break;

      const country = event.countries?.[0];
      const disasterType = event.dtype?.name ?? "";
      const startDate =
        event.disaster_start_date ?? event.created_at;
      const yearNum = new Date(startDate).getFullYear();
      const status =
        SEVERITY_MAP[event.ifrc_severity_level ?? 0] ?? "Monitoring";

      records.push({
        sourceKey: `ifrc-event-${event.id}`,
        title: event.name,
        country: country?.name ?? "",
        countryISO3: country?.iso3 ?? "",
        region: "",
        year: yearNum,
        indicatorName: "Emergency Event",
        indicatorValue: event.num_affected
          ? `${event.num_affected} affected`
          : "Affected population not reported",
        sourceOrganization: "IFRC",
        datasetName: "IFRC GO Emergency Events",
        dataSourceUrl: `https://goadmin.ifrc.org/emergencies/${event.slug ?? event.id}`,
        crisisType: disasterType,
        emergencyStatus: status,
        affectedPopulation: event.num_affected ?? 0,
        responseOrganization: country?.society_name ?? "Red Cross / Red Crescent",
        humanitarianSector: "",
        tags: [
          "IFRC",
          disasterType,
          country?.name ?? "",
          event.ifrc_severity_level_display,
        ].filter(Boolean),
        recordType: "crisis",
        lastModified: event.updated_at ?? event.created_at,
        contextNote:
          `GLIDE: ${(event as unknown as Record<string, string>)["glide"] ?? "N/A"}. ` +
          `Severity: ${event.ifrc_severity_level_display ?? "N/A"}. ` +
          `Active deployments: ${event.active_deployments ?? 0}.`,
      });
    }

    url = json.next;
    // Rate-limit courtesy
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

/**
 * Fetch humanitarian appeals from the IFRC GO API.
 */
export async function fetchIfrcAppeals(
  maxRecords = 200
): Promise<HumanitarianRecord[]> {
  const records: HumanitarianRecord[] = [];
  let url: string | null =
    "https://goadmin.ifrc.org/api/v2/appeal/?limit=50&format=json&ordering=-start_date";

  while (url && records.length < maxRecords) {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      console.warn(`IFRC GO appeals API error: ${response.status}`);
      break;
    }

    const json = (await response.json()) as IfrcAppealResponse;
    if (!json.results || json.results.length === 0) break;

    for (const appeal of json.results) {
      if (records.length >= maxRecords) break;

      const disasterType = appeal.dtype?.name ?? "";
      const startDate = appeal.start_date ?? appeal.created_at;
      const yearNum = new Date(startDate).getFullYear();

      const fundingGap =
        appeal.amount_requested > 0
          ? appeal.amount_requested - appeal.amount_funded
          : 0;
      const fundingPct =
        appeal.amount_requested > 0
          ? Math.round((appeal.amount_funded / appeal.amount_requested) * 100)
          : 0;

      records.push({
        sourceKey: `ifrc-appeal-${appeal.aid}`,
        title: appeal.name,
        country: appeal.country?.name ?? "",
        countryISO3: appeal.country?.iso3 ?? "",
        region: appeal.region?.name ?? "",
        year: yearNum,
        indicatorName: "Humanitarian Appeal",
        indicatorValue:
          `Requested: $${formatNumber(appeal.amount_requested)}, ` +
          `Funded: $${formatNumber(appeal.amount_funded)} (${fundingPct}%)`,
        sourceOrganization: "IFRC",
        datasetName: "IFRC GO Appeals",
        dataSourceUrl: `https://goadmin.ifrc.org/appeals/${appeal.aid}`,
        crisisType: disasterType,
        emergencyStatus: appeal.status_display ?? "Active",
        affectedPopulation: appeal.num_beneficiaries ?? 0,
        responseOrganization: appeal.country?.society_name ?? "Red Cross / Red Crescent",
        humanitarianSector: "",
        tags: [
          "IFRC",
          "Appeal",
          appeal.atype_display,
          disasterType,
          appeal.country?.name ?? "",
        ].filter(Boolean),
        recordType: "appeal",
        lastModified: appeal.modified_at ?? appeal.created_at,
        contextNote:
          `Type: ${appeal.atype_display}. ` +
          `Beneficiaries: ${formatNumber(appeal.num_beneficiaries)}. ` +
          `Funding gap: $${formatNumber(fundingGap)}.`,
      });
    }

    url = json.next;
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

