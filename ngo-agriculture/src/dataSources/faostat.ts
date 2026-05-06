import type { AgricultureRecord } from "./types.js";

/**
 * FAOSTAT REST API data source.
 *
 * Endpoint: https://fenixservices.fao.org/faostat/api/v1/en/data/{domain}
 * Domains used:
 *   QCL — Crops and livestock products (production)
 *   TP  — Trade (imports/exports)
 *   FS  — Food Security indicators
 *
 * Note: FAOSTAT API availability can be intermittent. The connector
 * handles failures gracefully and falls back to World Bank + OWID data.
 */

const FAOSTAT_BASE = "https://fenixservices.fao.org/faostat/api/v1/en/data";

// Key items for crop production queries
const CROP_ITEMS = [
  { code: "15", name: "Wheat" },
  { code: "27", name: "Rice" },
  { code: "56", name: "Maize (corn)" },
  { code: "236", name: "Soybeans" },
  { code: "44", name: "Barley" },
];

// Element codes: 5510 = Production (tonnes), 5419 = Yield (hg/ha)
const ELEMENTS = [
  { code: "5510", name: "Production", unit: "tonnes" },
  { code: "5419", name: "Yield", unit: "hg/ha" },
];

// Major producing countries (area codes)
const COUNTRIES = [
  { code: "351", name: "China", iso3: "CHN", region: "East Asia & Pacific" },
  { code: "100", name: "India", iso3: "IND", region: "South Asia" },
  { code: "231", name: "United States of America", iso3: "USA", region: "North America" },
  { code: "21", name: "Brazil", iso3: "BRA", region: "Latin America & Caribbean" },
  { code: "185", name: "Russian Federation", iso3: "RUS", region: "Europe & Central Asia" },
  { code: "79", name: "France", iso3: "FRA", region: "Europe & Central Asia" },
  { code: "9", name: "Argentina", iso3: "ARG", region: "Latin America & Caribbean" },
  { code: "101", name: "Indonesia", iso3: "IDN", region: "East Asia & Pacific" },
  { code: "141", name: "Mexico", iso3: "MEX", region: "Latin America & Caribbean" },
  { code: "59", name: "Ethiopia", iso3: "ETH", region: "Sub-Saharan Africa" },
  { code: "162", name: "Nigeria", iso3: "NGA", region: "Sub-Saharan Africa" },
  { code: "202", name: "Thailand", iso3: "THA", region: "East Asia & Pacific" },
];

// Recent years to query
const YEARS = ["2018", "2019", "2020", "2021", "2022"];

interface FaostatDataItem {
  Area: string;
  "Area Code (M49)"?: string;
  Item: string;
  Element: string;
  Year: number;
  Value: number | null;
  Unit: string;
}

interface FaostatResponse {
  data: FaostatDataItem[];
  metadata?: Record<string, unknown>;
}

/**
 * Fetch crop production data from FAOSTAT QCL domain.
 * Returns empty array if FAOSTAT API is unavailable.
 */
export async function fetchFaostatData(): Promise<AgricultureRecord[]> {
  const records: AgricultureRecord[] = [];

  for (const country of COUNTRIES) {
    for (const crop of CROP_ITEMS) {
      for (const element of ELEMENTS) {
        const url =
          `${FAOSTAT_BASE}/QCL` +
          `?area=${country.code}` +
          `&item=${crop.code}` +
          `&element=${element.code}` +
          `&year=${YEARS.join(",")}`;

        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15_000);

          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (!response.ok) {
            console.warn(
              `FAOSTAT API error for ${crop.name}/${country.name}: ${response.status}`
            );
            continue;
          }

          const json = (await response.json()) as FaostatResponse;
          if (!json.data || !Array.isArray(json.data)) continue;

          for (const dp of json.data) {
            if (dp.Value === null || dp.Value === undefined) continue;

            records.push({
              sourceKey: `fao-${country.iso3}-${crop.code}-${element.code}-${dp.Year}`,
              title: `${country.name}: ${crop.name} ${element.name} (${dp.Year})`,
              country: country.name,
              countryISO3: country.iso3,
              region: country.region,
              year: dp.Year,
              indicatorName: `${crop.name} — ${element.name}`,
              indicatorValue: String(dp.Value),
              sourceOrganization: "FAO",
              datasetName: "FAOSTAT Crops and Livestock Products",
              dataSourceUrl: `https://www.fao.org/faostat/en/#data/QCL`,
              agriculturalDomain: "Production",
              cropOrCommodity: crop.name,
              foodSecurityPhase: "",
              productionVolume: element.code === "5510" ? dp.Value : 0,
              tradeFlow: "",
              tags: ["Production", "FAO", crop.name, element.name],
              recordType: "indicator",
              lastModified: new Date().toISOString(),
            });
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.warn(
            `FAOSTAT fetch failed for ${crop.name}/${country.name}: ${msg}`
          );
          continue;
        }

        // Rate-limit: 300ms between requests
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  }

  return records;
}
