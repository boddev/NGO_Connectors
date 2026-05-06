import type { RefugeeRecord } from "./types.js";

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
 * UNHCR Refugee Data Portal — REST API.
 *
 * API base: https://api.unhcr.org/population/v1/population/
 * Returns refugee, IDP, asylum-seeker, and stateless data by country.
 * No authentication required. Paginated with `page` and `limit` params.
 */

// Region mapping for UNHCR 3-letter country codes
const UNHCR_REGION_MAP: Record<string, string> = {
  AFG: "South Asia", AGO: "Sub-Saharan Africa", ALB: "Europe & Central Asia",
  ARE: "Middle East & North Africa", ARG: "Latin America & Caribbean",
  AUS: "East Asia & Pacific", AUT: "Europe & Central Asia",
  BGD: "South Asia", BRA: "Latin America & Caribbean",
  CAN: "North America", CHN: "East Asia & Pacific",
  COD: "Sub-Saharan Africa", COL: "Latin America & Caribbean",
  DEU: "Europe & Central Asia", EGY: "Middle East & North Africa",
  ETH: "Sub-Saharan Africa", FRA: "Europe & Central Asia",
  GBR: "Europe & Central Asia", GHA: "Sub-Saharan Africa",
  IND: "South Asia", IDN: "East Asia & Pacific",
  IRN: "Middle East & North Africa", IRQ: "Middle East & North Africa",
  ITA: "Europe & Central Asia", JOR: "Middle East & North Africa",
  JPN: "East Asia & Pacific", KEN: "Sub-Saharan Africa",
  KOR: "East Asia & Pacific", LBN: "Middle East & North Africa",
  MEX: "Latin America & Caribbean", MMR: "East Asia & Pacific",
  MYS: "East Asia & Pacific", NGA: "Sub-Saharan Africa",
  PAK: "South Asia", PHL: "East Asia & Pacific",
  POL: "Europe & Central Asia", RUS: "Europe & Central Asia",
  SAU: "Middle East & North Africa", SDN: "Sub-Saharan Africa",
  SOM: "Sub-Saharan Africa", SSD: "Sub-Saharan Africa",
  SYR: "Middle East & North Africa", THA: "East Asia & Pacific",
  TUR: "Europe & Central Asia", TZA: "Sub-Saharan Africa",
  UGA: "Sub-Saharan Africa", UKR: "Europe & Central Asia",
  USA: "North America", VEN: "Latin America & Caribbean",
  VNM: "East Asia & Pacific", YEM: "Middle East & North Africa",
  ZAF: "Sub-Saharan Africa",
};

interface UnhcrApiResponse {
  page: number;
  maxPages: number;
  items: UnhcrPopulationItem[];
}

interface UnhcrPopulationItem {
  year: number;
  coo_id: number | string;
  coo_name: string;
  coo: string;
  coo_iso: string;
  coa_id: number | string;
  coa_name: string;
  coa: string;
  coa_iso: string;
  refugees: number | string;
  asylum_seekers: number | string;
  returned_refugees: number | string;
  idps: number | string;
  returned_idps: number | string;
  stateless: number | string;
  ooc: number | string;
  oip: number | string;
  hst: number | string;
}

function toNumber(val: number | string): number {
  if (typeof val === "number") return val;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Fetch UNHCR population data by country of origin.
 * Paginates through all pages to get complete dataset.
 */
export async function fetchUnhcrByOrigin(
  years: number[] = [2023, 2022, 2021, 2020]
): Promise<RefugeeRecord[]> {
  const records: RefugeeRecord[] = [];

  for (const year of years) {
    let page = 1;
    let maxPages = 1;

    while (page <= maxPages) {
      const url =
        `https://api.unhcr.org/population/v1/population/` +
        `?year=${year}&limit=100&coo_all=true&page=${page}`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(`UNHCR API error for year ${year} page ${page}: ${response.status}`);
        break;
      }

      const json = (await response.json()) as UnhcrApiResponse;
      if (!json.items || json.items.length === 0) break;

      maxPages = json.maxPages;

      for (const item of json.items) {
        const iso = item.coo_iso && item.coo_iso !== "-" ? item.coo_iso : item.coo;
        if (!iso || iso === "-") continue;

        const refugees = toNumber(item.refugees);
        const asylumSeekers = toNumber(item.asylum_seekers);
        const idps = toNumber(item.idps);
        const stateless = toNumber(item.stateless);
        const totalDisplaced = refugees + asylumSeekers + idps + stateless;

        if (totalDisplaced === 0) continue;

        const countryName = item.coo_name || iso;
        const region = UNHCR_REGION_MAP[iso] ?? "";

        // Create a consolidated record per origin country per year
        records.push({
          sourceKey: `unhcr-origin-${iso}-${year}`,
          title: `${countryName}: Displaced Population by Origin (${year})`,
          country: countryName,
          countryISO3: iso,
          region,
          year,
          indicatorName: "Displaced Population by Country of Origin",
          indicatorValue: `Refugees: ${refugees.toLocaleString()}, Asylum-seekers: ${asylumSeekers.toLocaleString()}, IDPs: ${idps.toLocaleString()}, Stateless: ${stateless.toLocaleString()}`,
          sourceOrganization: "UNHCR",
          datasetName: "UNHCR Refugee Data Portal",
          dataSourceUrl: `https://www.unhcr.org/refugee-statistics/download/?url=E1ZxP4`,
          displacementType: "Mixed",
          populationGroup: "All",
          countryOfOrigin: countryName,
          countryOfAsylum: "",
          displacedPopulation: totalDisplaced,
          tags: ["UNHCR", "Refugees", "Displacement", iso],
          recordType: "displacement",
          lastModified: new Date().toISOString(),
          methodologyNote:
            `UNHCR population data for ${year}. ` +
            `Refugees: ${refugees.toLocaleString()}. ` +
            `Asylum-seekers: ${asylumSeekers.toLocaleString()}. ` +
            `IDPs: ${idps.toLocaleString()}. ` +
            `Returned refugees: ${toNumber(item.returned_refugees).toLocaleString()}. ` +
            `Returned IDPs: ${toNumber(item.returned_idps).toLocaleString()}. ` +
            `Stateless: ${stateless.toLocaleString()}. ` +
            `Others of concern: ${toNumber(item.ooc).toLocaleString()}.`,
        });
      }

      page++;
    }

    // Rate-limit courtesy: 300ms between year requests
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

/**
 * Fetch UNHCR population data by country of asylum (host country).
 * Paginates through all pages to get complete dataset.
 */
export async function fetchUnhcrByAsylum(
  years: number[] = [2023, 2022, 2021, 2020]
): Promise<RefugeeRecord[]> {
  const records: RefugeeRecord[] = [];

  for (const year of years) {
    let page = 1;
    let maxPages = 1;

    while (page <= maxPages) {
      const url =
        `https://api.unhcr.org/population/v1/population/` +
        `?year=${year}&limit=100&coa_all=true&page=${page}`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(`UNHCR API error (asylum) for year ${year} page ${page}: ${response.status}`);
        break;
      }

      const json = (await response.json()) as UnhcrApiResponse;
      if (!json.items || json.items.length === 0) break;

      maxPages = json.maxPages;

      for (const item of json.items) {
        const iso = item.coa_iso && item.coa_iso !== "-" ? item.coa_iso : item.coa;
        if (!iso || iso === "-") continue;

        const refugees = toNumber(item.refugees);
        const asylumSeekers = toNumber(item.asylum_seekers);
        const stateless = toNumber(item.stateless);
        const totalHosted = refugees + asylumSeekers + stateless;

        if (totalHosted === 0) continue;

        const countryName = item.coa_name || iso;
        const region = UNHCR_REGION_MAP[iso] ?? "";

        records.push({
          sourceKey: `unhcr-asylum-${iso}-${year}`,
          title: `${countryName}: Hosted Displaced Population (${year})`,
          country: countryName,
          countryISO3: iso,
          region,
          year,
          indicatorName: "Hosted Displaced Population by Country of Asylum",
          indicatorValue: `Refugees hosted: ${refugees.toLocaleString()}, Asylum-seekers: ${asylumSeekers.toLocaleString()}, Stateless: ${stateless.toLocaleString()}`,
          sourceOrganization: "UNHCR",
          datasetName: "UNHCR Refugee Data Portal",
          dataSourceUrl: `https://www.unhcr.org/refugee-statistics/download/?url=E1ZxP4`,
          displacementType: "Hosted",
          populationGroup: "All",
          countryOfOrigin: "",
          countryOfAsylum: countryName,
          displacedPopulation: totalHosted,
          tags: ["UNHCR", "Refugees", "Asylum", "Host Country", iso],
          recordType: "displacement",
          lastModified: new Date().toISOString(),
          methodologyNote:
            `UNHCR host country data for ${year}. ` +
            `Refugees hosted: ${refugees.toLocaleString()}. ` +
            `Asylum-seekers: ${asylumSeekers.toLocaleString()}. ` +
            `Stateless: ${stateless.toLocaleString()}.`,
        });
      }

      page++;
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

