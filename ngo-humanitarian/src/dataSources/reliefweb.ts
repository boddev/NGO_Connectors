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
 * ReliefWeb API v2 — crisis reports, situation updates, and needs assessments.
 *
 * Requires an approved appname. Register at:
 * https://apidoc.reliefweb.int/parameters#appname
 *
 * Set RELIEFWEB_APPNAME environment variable to your approved appname.
 */

interface ReliefWebResponse {
  totalCount: number;
  count: number;
  data: ReliefWebItem[];
  href: string;
}

interface ReliefWebItem {
  id: string;
  score: number;
  href: string;
  fields: {
    title?: string;
    date?: { created?: string; changed?: string };
    country?: Array<{ name: string; iso3: string; shortname: string }>;
    source?: Array<{ name: string; shortname: string }>;
    disaster_type?: Array<{ name: string }>;
    status?: string;
    url?: string;
    body?: string;
  };
}

function getAppname(): string {
  const appname = process.env.RELIEFWEB_APPNAME;
  if (!appname) {
    throw new Error(
      "RELIEFWEB_APPNAME environment variable is required. " +
        "Register at https://apidoc.reliefweb.int/parameters#appname"
    );
  }
  return appname;
}

/**
 * Fetch crisis reports from the ReliefWeb API v2.
 * Paginates through results using offset.
 */
export async function fetchReliefWebData(
  maxRecords = 500
): Promise<HumanitarianRecord[]> {
  const records: HumanitarianRecord[] = [];
  const appname = getAppname();
  let offset = 0;
  const limit = 50;

  while (records.length < maxRecords) {
    const body = JSON.stringify({
      limit,
      offset,
      fields: {
        include: [
          "title",
          "date",
          "country",
          "source",
          "disaster_type",
          "status",
          "url",
        ],
      },
      sort: ["date.created:desc"],
    });

    const url = `https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(appname)}`;

    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });

    if (!response.ok) {
      console.warn(`ReliefWeb API error: ${response.status}`);
      break;
    }

    const json = (await response.json()) as ReliefWebResponse;
    if (!json.data || json.data.length === 0) break;

    for (const item of json.data) {
      const fields = item.fields;
      const country = fields.country?.[0];
      const source = fields.source?.[0];
      const disasterType = fields.disaster_type?.[0]?.name ?? "";
      const created = fields.date?.created ?? new Date().toISOString();
      const yearNum = new Date(created).getFullYear();

      records.push({
        sourceKey: `rw-${item.id}`,
        title: fields.title ?? `ReliefWeb Report ${item.id}`,
        country: country?.name ?? "",
        countryISO3: country?.iso3 ?? "",
        region: "",
        year: yearNum,
        indicatorName: "Crisis Report",
        indicatorValue: fields.title ?? "",
        sourceOrganization: source?.name ?? "ReliefWeb",
        datasetName: "ReliefWeb Crisis Reports",
        dataSourceUrl: fields.url ?? item.href,
        crisisType: disasterType,
        emergencyStatus: fields.status ?? "Active",
        affectedPopulation: 0,
        responseOrganization: source?.name ?? "",
        humanitarianSector: "",
        tags: ["ReliefWeb", disasterType, country?.name ?? ""].filter(Boolean),
        recordType: "crisis",
        lastModified: fields.date?.changed ?? created,
        contextNote: `Source: ${source?.name ?? "Unknown"}. ` +
          `Disaster type: ${disasterType || "Unspecified"}.`,
      });
    }

    offset += limit;
    if (json.data.length < limit) break;

    // Rate-limit courtesy
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

