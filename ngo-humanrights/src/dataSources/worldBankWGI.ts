import type { GovernanceRecord } from "./types.js";

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
 * World Bank Worldwide Governance Indicators (WGI).
 * Source 3 in the World Bank API. Uses GOV_WGI_ prefixed codes.
 *
 * Six governance dimensions:
 *  - CC: Control of Corruption
 *  - GE: Government Effectiveness
 *  - RL: Rule of Law
 *  - RQ: Regulatory Quality
 *  - VA: Voice and Accountability
 *  - PV: Political Stability and Absence of Violence
 *
 * Each dimension has two main variants:
 *  - .EST: Governance estimate (approx. -2.5 to +2.5)
 *  - .SC:  Governance score (0–100 percentile rank)
 */
const WGI_INDICATORS: Array<{
  code: string;
  name: string;
  dimension: string;
  rightsDomain: string;
  variant: "estimate" | "score";
}> = [
  {
    code: "GOV_WGI_CC.EST",
    name: "Control of Corruption — Governance Estimate",
    dimension: "Control of Corruption",
    rightsDomain: "Corruption",
    variant: "estimate",
  },
  {
    code: "GOV_WGI_CC.SC",
    name: "Control of Corruption — Governance Score (0–100)",
    dimension: "Control of Corruption",
    rightsDomain: "Corruption",
    variant: "score",
  },
  {
    code: "GOV_WGI_GE.EST",
    name: "Government Effectiveness — Governance Estimate",
    dimension: "Government Effectiveness",
    rightsDomain: "Rule of Law",
    variant: "estimate",
  },
  {
    code: "GOV_WGI_GE.SC",
    name: "Government Effectiveness — Governance Score (0–100)",
    dimension: "Government Effectiveness",
    rightsDomain: "Rule of Law",
    variant: "score",
  },
  {
    code: "GOV_WGI_RL.EST",
    name: "Rule of Law — Governance Estimate",
    dimension: "Rule of Law",
    rightsDomain: "Rule of Law",
    variant: "estimate",
  },
  {
    code: "GOV_WGI_RL.SC",
    name: "Rule of Law — Governance Score (0–100)",
    dimension: "Rule of Law",
    rightsDomain: "Rule of Law",
    variant: "score",
  },
  {
    code: "GOV_WGI_RQ.EST",
    name: "Regulatory Quality — Governance Estimate",
    dimension: "Regulatory Quality",
    rightsDomain: "Rule of Law",
    variant: "estimate",
  },
  {
    code: "GOV_WGI_RQ.SC",
    name: "Regulatory Quality — Governance Score (0–100)",
    dimension: "Regulatory Quality",
    rightsDomain: "Rule of Law",
    variant: "score",
  },
  {
    code: "GOV_WGI_VA.EST",
    name: "Voice and Accountability — Governance Estimate",
    dimension: "Voice and Accountability",
    rightsDomain: "Political Rights",
    variant: "estimate",
  },
  {
    code: "GOV_WGI_VA.SC",
    name: "Voice and Accountability — Governance Score (0–100)",
    dimension: "Voice and Accountability",
    rightsDomain: "Political Rights",
    variant: "score",
  },
  {
    code: "GOV_WGI_PV.EST",
    name: "Political Stability — Governance Estimate",
    dimension: "Political Stability",
    rightsDomain: "Political Rights",
    variant: "estimate",
  },
  {
    code: "GOV_WGI_PV.SC",
    name: "Political Stability — Governance Score (0–100)",
    dimension: "Political Stability",
    rightsDomain: "Political Rights",
    variant: "score",
  },
];

// World Bank region mapping
const WB_REGIONS: Record<string, string> = {
  EAS: "East Asia & Pacific",
  ECS: "Europe & Central Asia",
  LCN: "Latin America & Caribbean",
  MEA: "Middle East & North Africa",
  NAC: "North America",
  SAS: "South Asia",
  SSF: "Sub-Saharan Africa",
};

interface WBApiResponse {
  page: number;
  pages: number;
  per_page: number;
  total: number;
}

interface WBDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  decimal: number;
  region?: { id: string; value: string };
}

/**
 * Fetch all WGI indicators from the World Bank API (source 3).
 * Paginates through all countries for each indicator code.
 */
export async function fetchWorldBankWGI(): Promise<GovernanceRecord[]> {
  const records: GovernanceRecord[] = [];

  for (const ind of WGI_INDICATORS) {
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const url =
        `https://api.worldbank.org/v2/country/all/indicator/${ind.code}` +
        `?format=json&per_page=300&date=1996:2025&source=3&page=${page}`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(
          `World Bank WGI API error for ${ind.code} page ${page}: ${response.status}`
        );
        break;
      }

      const json = (await response.json()) as [WBApiResponse, WBDataPoint[]];
      if (!json || !json[1]) break;

      const [meta, data] = json;
      totalPages = meta.pages;

      for (const dp of data) {
        if (dp.value === null || dp.value === undefined) continue;
        // Skip aggregate/regional entries
        if (!dp.countryiso3code || dp.countryiso3code.length !== 3) continue;

        const regionId = dp.region?.id ?? "";
        const regionName = WB_REGIONS[regionId] ?? regionId;
        const yearNum = parseInt(dp.date, 10);

        records.push({
          sourceKey: `wgi-${dp.countryiso3code}-${ind.code}-${dp.date}`,
          title: `${dp.country.value}: ${ind.dimension} (${dp.date})`,
          country: dp.country.value,
          countryISO3: dp.countryiso3code,
          region: regionName,
          year: yearNum,
          indicatorName: ind.name,
          indicatorValue: String(dp.value),
          sourceOrganization: "World Bank",
          datasetName: "Worldwide Governance Indicators (WGI)",
          dataSourceUrl: `https://data.worldbank.org/indicator/${ind.code}`,
          governanceIndicator: ind.dimension,
          indexScore: dp.value,
          indexRank: 0, // Ranks computed in post-processing
          rightsDomain: ind.rightsDomain,
          assessmentYear: yearNum,
          tags: [ind.rightsDomain, "WGI", ind.dimension, "World Bank"],
          recordType: "indicator",
          lastModified: new Date().toISOString(),
          methodologyNote:
            ind.variant === "estimate"
              ? `Governance estimate ranges from approximately -2.5 (weak) to +2.5 (strong). ` +
                `Dimension: ${ind.dimension}.`
              : `Governance percentile rank score ranges from 0 (lowest) to 100 (highest). ` +
                `Dimension: ${ind.dimension}.`,
        });
      }

      page++;
    }

    // Rate-limit courtesy: 200ms between indicator requests
    await new Promise((r) => setTimeout(r, 200));
  }

  return records;
}

