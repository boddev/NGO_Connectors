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
 * HDX (Humanitarian Data Exchange) — CKAN API.
 * Public API, no authentication required.
 * Endpoint: https://data.humdata.org/api/3/
 */

interface CkanSearchResponse {
  success: boolean;
  result: {
    count: number;
    results: CkanPackage[];
  };
}

interface CkanPackage {
  id: string;
  name: string;
  title: string;
  notes: string;
  organization: { title: string; name: string } | null;
  metadata_modified: string;
  resources: Array<{
    id: string;
    name: string;
    format: string;
    url: string;
  }>;
  groups: Array<{ name: string; title: string }>;
  tags: Array<{ name: string }>;
  dataset_date: string;
  data_update_frequency: string;
  subnational: string;
}

/**
 * Search HDX for humanitarian datasets matching crisis-related queries.
 */
export async function fetchHdxData(
  maxRecords = 200
): Promise<HumanitarianRecord[]> {
  const records: HumanitarianRecord[] = [];

  const queries = [
    "humanitarian crisis",
    "disaster response",
    "displacement",
    "food security",
    "emergency",
  ];

  for (const query of queries) {
    if (records.length >= maxRecords) break;

    let start = 0;
    const rows = 50;

    while (records.length < maxRecords) {
      const url =
        `https://data.humdata.org/api/3/action/package_search` +
        `?q=${encodeURIComponent(query)}&rows=${rows}&start=${start}`;

      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(`HDX API error for query "${query}": ${response.status}`);
        break;
      }

      const json = (await response.json()) as CkanSearchResponse;
      if (!json.success || !json.result.results.length) break;

      for (const pkg of json.result.results) {
        if (records.length >= maxRecords) break;

        const orgName = pkg.organization?.title ?? "Unknown";
        const modified = pkg.metadata_modified ?? new Date().toISOString();
        const yearNum = new Date(modified).getFullYear();
        const tagNames = pkg.tags?.map((t) => t.name) ?? [];
        const groups = pkg.groups?.map((g) => g.title) ?? [];

        // Infer humanitarian sector from tags
        const sector = inferSector(tagNames);
        // Infer crisis type from tags
        const crisis = inferCrisisType(tagNames);

        records.push({
          sourceKey: `hdx-${pkg.id}`,
          title: pkg.title,
          country: groups.length > 0 ? groups[0] : "",
          countryISO3: "",
          region: "",
          year: yearNum,
          indicatorName: "Humanitarian Dataset",
          indicatorValue: `${pkg.resources?.length ?? 0} resources available`,
          sourceOrganization: orgName,
          datasetName: "Humanitarian Data Exchange (HDX)",
          dataSourceUrl: `https://data.humdata.org/dataset/${pkg.name}`,
          crisisType: crisis,
          emergencyStatus: "Active",
          affectedPopulation: 0,
          responseOrganization: orgName,
          humanitarianSector: sector,
          tags: ["HDX", ...tagNames.slice(0, 5)],
          recordType: "dataset",
          lastModified: modified,
          contextNote: pkg.notes
            ? pkg.notes.substring(0, 500)
            : undefined,
        });
      }

      start += rows;
      if (json.result.results.length < rows) break;

      // Rate-limit courtesy
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return records;
}

const SECTOR_KEYWORDS: Record<string, string[]> = {
  Protection: ["protection", "gbv", "child protection", "human rights"],
  Shelter: ["shelter", "housing", "nfi"],
  WASH: ["wash", "water", "sanitation", "hygiene"],
  Health: ["health", "medical", "disease", "epidemic", "cholera", "covid"],
  "Food Security": ["food", "nutrition", "famine", "hunger", "ipc"],
  Education: ["education", "school", "learning"],
  "Camp Coordination": ["camp", "idp", "refugee", "displacement"],
  Logistics: ["logistics", "supply chain", "transport"],
};

function inferSector(tags: string[]): string {
  const lower = tags.map((t) => t.toLowerCase());
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((kw) => lower.some((t) => t.includes(kw)))) {
      return sector;
    }
  }
  return "";
}

const CRISIS_KEYWORDS: Record<string, string[]> = {
  Conflict: ["conflict", "war", "violence", "armed"],
  Flood: ["flood", "flooding"],
  Earthquake: ["earthquake", "seismic"],
  Drought: ["drought"],
  Epidemic: ["epidemic", "pandemic", "outbreak", "disease", "cholera", "covid"],
  Cyclone: ["cyclone", "hurricane", "typhoon", "storm"],
  Displacement: ["displacement", "refugee", "idp"],
};

function inferCrisisType(tags: string[]): string {
  const lower = tags.map((t) => t.toLowerCase());
  for (const [crisis, keywords] of Object.entries(CRISIS_KEYWORDS)) {
    if (keywords.some((kw) => lower.some((t) => t.includes(kw)))) {
      return crisis;
    }
  }
  return "";
}

