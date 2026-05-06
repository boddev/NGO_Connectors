import type { GenderRecord } from "./types.js";

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
 * OWID indicator definitions for gender-related data.
 * Uses the OWID API v1 JSON endpoint for each indicator.
 */
const OWID_INDICATORS: Array<{
  indicatorId: number;
  name: string;
  domain: string;
  genderIndicator: string;
  unit: string;
  dataSourceUrl: string;
  datasetName: string;
}> = [
  {
    indicatorId: 1209895,
    name: "Lower chamber female legislators (%)",
    domain: "Political Participation",
    genderIndicator: "Women in Parliament % (V-Dem)",
    unit: "percentage",
    dataSourceUrl: "https://ourworldindata.org/grapher/share-of-women-in-parliament",
    datasetName: "OWID — Women in Parliament (V-Dem)",
  },
  {
    indicatorId: 1205321,
    name: "Labor force participation rate, female (% ages 15+, modeled ILO)",
    domain: "Economic",
    genderIndicator: "Female Labor Force Participation (ILO)",
    unit: "percentage",
    dataSourceUrl: "https://ourworldindata.org/grapher/female-labor-force-participation-rates",
    datasetName: "OWID — Female Labor Force Participation",
  },
  {
    indicatorId: 959831,
    name: "Maternal mortality ratio (per 100,000 live births)",
    domain: "Health",
    genderIndicator: "Maternal Mortality Ratio",
    unit: "deaths per 100,000 live births",
    dataSourceUrl: "https://ourworldindata.org/grapher/maternal-mortality",
    datasetName: "OWID — Maternal Mortality",
  },
];

interface OwidDataResponse {
  values: number[];
  years: number[];
  entities: number[];
}

interface OwidEntityInfo {
  id: number;
  name: string;
  code: string;
}

interface OwidMetadataResponse {
  name: string;
  unit: string;
  dimensions: {
    entities: {
      values: OwidEntityInfo[];
    };
  };
}

// Region mapping for common ISO codes
const ISO_REGION_MAP: Record<string, string> = {
  AFG: "South Asia", AGO: "Sub-Saharan Africa", ALB: "Europe & Central Asia",
  ARE: "Middle East & North Africa", ARG: "Latin America & Caribbean",
  AUS: "East Asia & Pacific", AUT: "Europe & Central Asia",
  BGD: "South Asia", BEL: "Europe & Central Asia",
  BRA: "Latin America & Caribbean", CAN: "North America",
  CHN: "East Asia & Pacific", COD: "Sub-Saharan Africa",
  COL: "Latin America & Caribbean", CRI: "Latin America & Caribbean",
  DEU: "Europe & Central Asia", EGY: "Middle East & North Africa",
  ESP: "Europe & Central Asia", ETH: "Sub-Saharan Africa",
  FRA: "Europe & Central Asia", GBR: "Europe & Central Asia",
  GHA: "Sub-Saharan Africa", GTM: "Latin America & Caribbean",
  IND: "South Asia", IDN: "East Asia & Pacific",
  IRN: "Middle East & North Africa", IRQ: "Middle East & North Africa",
  ITA: "Europe & Central Asia", JPN: "East Asia & Pacific",
  KEN: "Sub-Saharan Africa", KOR: "East Asia & Pacific",
  LKA: "South Asia", MAR: "Middle East & North Africa",
  MEX: "Latin America & Caribbean", MMR: "East Asia & Pacific",
  MOZ: "Sub-Saharan Africa", MYS: "East Asia & Pacific",
  NGA: "Sub-Saharan Africa", NOR: "Europe & Central Asia",
  NPL: "South Asia", PAK: "South Asia",
  PER: "Latin America & Caribbean", PHL: "East Asia & Pacific",
  POL: "Europe & Central Asia", ROU: "Europe & Central Asia",
  RUS: "Europe & Central Asia", RWA: "Sub-Saharan Africa",
  SAU: "Middle East & North Africa", SWE: "Europe & Central Asia",
  THA: "East Asia & Pacific", TUR: "Europe & Central Asia",
  TZA: "Sub-Saharan Africa", UGA: "Sub-Saharan Africa",
  UKR: "Europe & Central Asia", USA: "North America",
  VNM: "East Asia & Pacific", ZAF: "Sub-Saharan Africa",
  ZMB: "Sub-Saharan Africa", ZWE: "Sub-Saharan Africa",
};

/**
 * Fetch gender indicators from the Our World in Data API v1.
 * Each indicator returns parallel arrays of values, years, and entity IDs.
 * Entity IDs are resolved to country names via the metadata endpoint.
 */
export async function fetchOwidData(): Promise<GenderRecord[]> {
  const records: GenderRecord[] = [];

  for (const ind of OWID_INDICATORS) {
    try {
      // Fetch metadata (includes entity-to-country mapping)
      const metaUrl = `https://api.ourworldindata.org/v1/indicators/${ind.indicatorId}.metadata.json`;
      const metaResponse = await fetchWithTimeout(metaUrl);
      if (!metaResponse.ok) {
        console.warn(`OWID metadata error for ${ind.indicatorId}: ${metaResponse.status}`);
        continue;
      }
      const metadata = (await metaResponse.json()) as OwidMetadataResponse;

      // Build entity ID → country info lookup
      const entityMap = new Map<number, OwidEntityInfo>();
      for (const entity of metadata.dimensions.entities.values) {
        entityMap.set(entity.id, entity);
      }

      // Fetch data
      const dataUrl = `https://api.ourworldindata.org/v1/indicators/${ind.indicatorId}.data.json`;
      const dataResponse = await fetchWithTimeout(dataUrl);
      if (!dataResponse.ok) {
        console.warn(`OWID data error for ${ind.indicatorId}: ${dataResponse.status}`);
        continue;
      }
      const data = (await dataResponse.json()) as OwidDataResponse;

      // Process parallel arrays
      for (let i = 0; i < data.values.length; i++) {
        const value = data.values[i];
        const year = data.years[i];
        const entityId = data.entities[i];

        if (value === null || value === undefined) continue;
        if (year < 2000) continue;

        const entity = entityMap.get(entityId);
        if (!entity) continue;

        // Skip aggregates (no ISO code or non-standard codes)
        const iso = entity.code ?? "";
        if (!iso || iso.length !== 3 || iso.startsWith("OWID_")) continue;

        const region = ISO_REGION_MAP[iso] ?? "";
        const participationRate =
          ind.domain === "Political Participation" || ind.domain === "Economic"
            ? value
            : 0;

        records.push({
          sourceKey: `owid-${iso}-${ind.indicatorId}-${year}`,
          title: `${entity.name}: ${ind.name} (${year})`,
          country: entity.name,
          countryISO3: iso,
          region,
          year,
          indicatorName: ind.name,
          indicatorValue: String(value),
          measureUnit: ind.unit,
          sourceOrganization: "Our World in Data",
          datasetName: ind.datasetName,
          dataSourceUrl: ind.dataSourceUrl,
          genderIndicator: ind.genderIndicator,
          genderParityIndex: 0,
          violenceType: "",
          participationRate,
          genderDomain: ind.domain,
          tags: [ind.domain, "OWID", "Gender Equality", ind.genderIndicator],
          recordType: "indicator",
          lastModified: new Date().toISOString(),
        });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`OWID indicator ${ind.indicatorId} failed: ${msg}`);
    }

    // Rate-limit courtesy
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

