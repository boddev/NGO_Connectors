import type { AidFundingRecord } from "./types.js";

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
 * IATI Registry CKAN API.
 *
 * The IATI Registry provides metadata about organizations that publish
 * aid transparency data. We use the CKAN API to list publishers and
 * their activity counts.
 *
 * Note: The IATI Datastore API (api.iatistandard.org) requires a
 * subscription key. Set IATI_API_KEY in environment variables to enable
 * Datastore queries. Without it, only Registry metadata is fetched.
 */

const IATI_REGISTRY_BASE = "https://iatiregistry.org/api/3/action";

interface CkanOrganization {
  name: string;
  title: string;
  description: string;
  id: string;
  state: string;
  package_count: number;
  created: string;
}

interface CkanOrgListResponse {
  success: boolean;
  result: CkanOrganization[];
}

interface CkanPackage {
  name: string;
  title: string;
  organization: {
    name: string;
    title: string;
  };
  extras: Array<{ key: string; value: unknown }>;
  resources: Array<{
    url: string;
    format: string;
  }>;
  state: string;
}

interface CkanPackageShowResponse {
  success: boolean;
  result: CkanPackage;
}

/**
 * Fetch IATI publisher organizations from the Registry.
 * Returns metadata about organizations that publish IATI data.
 */
export async function fetchIatiPublishers(): Promise<AidFundingRecord[]> {
  const records: AidFundingRecord[] = [];

  // Step 1: Get list of organization names
  const orgListUrl = `${IATI_REGISTRY_BASE}/organization_list?all_fields=true&limit=200`;
  const orgListResponse = await fetchWithTimeout(orgListUrl);
  if (!orgListResponse.ok) {
    console.warn(`IATI Registry org list failed: ${orgListResponse.status}`);
    return records;
  }

  const orgListJson = (await orgListResponse.json()) as CkanOrgListResponse;
  if (!orgListJson.success || !Array.isArray(orgListJson.result)) {
    console.warn("IATI Registry returned unexpected format");
    return records;
  }

  const organizations = orgListJson.result;
  console.log(`IATI Registry: ${organizations.length} publishers found`);

  for (const org of organizations) {
    if (org.state !== "active") continue;

    records.push({
      sourceKey: `iati-pub-${org.name}`,
      title: `IATI Publisher: ${org.title || org.name}`,
      country: "",
      countryISO3: "",
      region: "",
      year: new Date().getFullYear(),
      indicatorName: "IATI Publisher Profile",
      indicatorValue: `${org.package_count} datasets published`,
      sourceOrganization: "IATI Registry",
      datasetName: "IATI Publisher Registry",
      dataSourceUrl: `https://iatiregistry.org/publisher/${org.name}`,
      donorOrganization: org.title || org.name,
      recipientCountry: "",
      aidSector: "Aid Transparency",
      disbursementAmount: 0,
      aidType: "Transparency",
      currency: "",
      tags: ["IATI", "Publisher", "Transparency"],
      recordType: "publisher",
      lastModified: org.created || new Date().toISOString(),
      methodologyNote:
        `Organization ID: ${org.id}. ` +
        `Published datasets: ${org.package_count}. ` +
        `${org.description ? "Description: " + org.description.substring(0, 300) : ""}`,
    });

    // Rate-limit: brief pause every 50 records
    if (records.length % 50 === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  return records;
}

/**
 * Fetch activity details from the IATI Datastore (requires API key).
 * If IATI_API_KEY is not set, returns an empty array.
 */
export async function fetchIatiActivities(): Promise<AidFundingRecord[]> {
  const apiKey = process.env.IATI_API_KEY;
  if (!apiKey) {
    console.log(
      "IATI_API_KEY not set — skipping IATI Datastore activity fetch. " +
        "Set IATI_API_KEY in environment variables to enable."
    );
    return [];
  }

  const records: AidFundingRecord[] = [];
  let start = 0;
  const rows = 100;
  const maxRecords = 2000;

  while (start < maxRecords) {
    const url =
      `https://api.iatistandard.org/datastore/activity/select` +
      `?q=*&rows=${rows}&start=${start}` +
      `&fl=iati_identifier,title_narrative,reporting_org_narrative,` +
      `recipient_country_code,sector_code,transaction_value,default_currency` +
      `&wt=json`;

    const response = await fetchWithTimeout(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
    });

    if (!response.ok) {
      console.warn(`IATI Datastore error at start=${start}: ${response.status}`);
      break;
    }

    const json = (await response.json()) as {
      response: {
        numFound: number;
        docs: Array<{
          iati_identifier: string;
          title_narrative: string[];
          reporting_org_narrative: string[];
          recipient_country_code: string[];
          sector_code: string[];
          transaction_value: number[];
          default_currency: string;
        }>;
      };
    };

    const docs = json.response?.docs;
    if (!docs || docs.length === 0) break;

    for (const doc of docs) {
      const id = doc.iati_identifier ?? "";
      if (!id) continue;

      const title =
        doc.title_narrative?.[0] ?? `IATI Activity ${id}`;
      const donor =
        doc.reporting_org_narrative?.[0] ?? "";
      const recipientCode = doc.recipient_country_code?.[0] ?? "";
      const sectorCode = doc.sector_code?.[0] ?? "";
      const txnValue = doc.transaction_value?.[0] ?? 0;
      const currency = doc.default_currency ?? "USD";

      records.push({
        sourceKey: `iati-act-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
        title: `${donor}: ${title}`,
        country: recipientCode,
        countryISO3: recipientCode,
        region: "",
        year: new Date().getFullYear(),
        indicatorName: "IATI Activity",
        indicatorValue: txnValue > 0 ? String(txnValue) : "Not reported",
        sourceOrganization: "IATI Datastore",
        datasetName: "IATI Activity Data",
        dataSourceUrl: `https://d-portal.org/ctrack.html?reporting_ref=${encodeURIComponent(donor)}#view=act&aid=${encodeURIComponent(id)}`,
        donorOrganization: donor,
        recipientCountry: recipientCode,
        aidSector: sectorCode,
        disbursementAmount: txnValue,
        aidType: "Bilateral",
        currency,
        tags: ["IATI", "Activity", donor].filter(Boolean),
        recordType: "indicator",
        lastModified: new Date().toISOString(),
      });
    }

    start += rows;
    // Rate-limit courtesy
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

