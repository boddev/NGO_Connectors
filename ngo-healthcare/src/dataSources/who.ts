import type { HealthRecord } from "./types.js";

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
 * WHO Global Health Observatory (GHO) indicator codes — verified working.
 * Each entry maps to a GHO REST API endpoint at ghoapi.azureedge.net.
 */
const WHO_INDICATORS: Array<{
  code: string;
  name: string;
  unit: string;
  domain: string;
  disease: string;
  ageGroup: string;
}> = [
  {
    code: "WHOSIS_000001",
    name: "Life expectancy at birth (years)",
    unit: "years",
    domain: "Mortality",
    disease: "All causes",
    ageGroup: "All ages",
  },
  {
    code: "MDG_0000000001",
    name: "Under-5 mortality rate (per 1,000 live births)",
    unit: "per 1,000 live births",
    domain: "Child Health",
    disease: "All causes",
    ageGroup: "Under 5",
  },
  {
    code: "WHOSIS_000004",
    name: "Neonatal mortality rate (per 1,000 live births)",
    unit: "per 1,000 live births",
    domain: "Child Health",
    disease: "All causes",
    ageGroup: "Neonatal",
  },
  {
    code: "MDG_0000000026",
    name: "Maternal mortality ratio (per 100,000 live births)",
    unit: "per 100,000 live births",
    domain: "Maternal Health",
    disease: "Maternal conditions",
    ageGroup: "15-49",
  },
  {
    code: "WHS4_100",
    name: "Measles immunization coverage among 1-year-olds (%)",
    unit: "percentage",
    domain: "Immunization",
    disease: "Measles",
    ageGroup: "12-23 months",
  },
  {
    code: "WHOSIS_000002",
    name: "Healthy life expectancy at birth (years)",
    unit: "years",
    domain: "Mortality",
    disease: "All causes",
    ageGroup: "All ages",
  },
];

// Map WHO SpatialDim codes to region names
const WHO_REGION_MAP: Record<string, string> = {
  AFR: "Sub-Saharan Africa",
  AMR: "Americas",
  SEAR: "South-East Asia",
  EUR: "Europe",
  EMR: "Eastern Mediterranean",
  WPR: "Western Pacific",
};

// Map WHO Dim1 sex codes to readable labels
const SEX_MAP: Record<string, string> = {
  SEX_BTSX: "Both",
  SEX_MLE: "Male",
  SEX_FMLE: "Female",
  BTSX: "Both",
  MLE: "Male",
  FMLE: "Female",
};

interface GhoDataPoint {
  IndicatorCode: string;
  SpatialDimType: string;
  SpatialDim: string;
  TimeDimType: string;
  TimeDim: number;
  Dim1Type: string | null;
  Dim1: string | null;
  Dim2Type: string | null;
  Dim2: string | null;
  NumericValue: number | null;
  Value: string;
  ParentLocationCode: string;
  ParentLocation: string;
}

interface GhoApiResponse {
  value: GhoDataPoint[];
  "@odata.nextLink"?: string;
}

// ISO3 to country name mapping for WHO data (countries without names in API)
const ISO3_COUNTRY_MAP: Record<string, string> = {
  AFG: "Afghanistan", AGO: "Angola", ALB: "Albania",
  ARE: "United Arab Emirates", ARG: "Argentina", AUS: "Australia",
  AUT: "Austria", BRA: "Brazil", CAN: "Canada", CHN: "China",
  COD: "Congo, Dem. Rep.", DEU: "Germany", EGY: "Egypt",
  ETH: "Ethiopia", FRA: "France", GBR: "United Kingdom",
  GHA: "Ghana", IND: "India", IDN: "Indonesia", IRN: "Iran",
  IRQ: "Iraq", ITA: "Italy", JPN: "Japan", KEN: "Kenya",
  KOR: "Korea, Rep.", MEX: "Mexico", MYS: "Malaysia",
  NGA: "Nigeria", PAK: "Pakistan", PHL: "Philippines",
  POL: "Poland", RUS: "Russian Federation", SAU: "Saudi Arabia",
  THA: "Thailand", TUR: "Turkiye", UKR: "Ukraine",
  USA: "United States", VNM: "Vietnam", ZAF: "South Africa",
};

/**
 * Fetch health indicators from the WHO Global Health Observatory API.
 * Paginates through OData results for each indicator code.
 */
export async function fetchWhoData(): Promise<HealthRecord[]> {
  const records: HealthRecord[] = [];

  for (const ind of WHO_INDICATORS) {
    let url: string | undefined =
      `https://ghoapi.azureedge.net/api/${ind.code}` +
      `?$filter=TimeDimType eq 'YEAR' and SpatialDimType eq 'COUNTRY'`;

    while (url) {
      const response = await fetchWithTimeout(url);
      if (!response.ok) {
        console.warn(
          `WHO GHO API error for ${ind.code}: ${response.status}`
        );
        break;
      }

      const json = (await response.json()) as GhoApiResponse;
      if (!json.value || json.value.length === 0) break;

      for (const dp of json.value) {
        if (dp.NumericValue === null || dp.NumericValue === undefined) continue;
        if (!dp.SpatialDim || dp.SpatialDim.length !== 3) continue;

        const yearNum = dp.TimeDim;
        if (yearNum < 2000) continue;

        const sex = dp.Dim1 ? (SEX_MAP[dp.Dim1] ?? dp.Dim1) : "Both";
        const regionCode = dp.ParentLocationCode ?? "";
        const regionName =
          WHO_REGION_MAP[regionCode] ?? dp.ParentLocation ?? regionCode;
        const countryName =
          ISO3_COUNTRY_MAP[dp.SpatialDim] ?? dp.SpatialDim;

        records.push({
          sourceKey: `who-${dp.SpatialDim}-${ind.code}-${yearNum}-${sex}`,
          title: `${countryName}: ${ind.name} (${yearNum})`,
          country: countryName,
          countryISO3: dp.SpatialDim,
          region: regionName,
          year: yearNum,
          indicatorName: ind.name,
          indicatorValue: String(dp.NumericValue),
          measureUnit: ind.unit,
          sourceOrganization: "World Health Organization",
          datasetName: "Global Health Observatory (GHO)",
          dataSourceUrl: `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${ind.code}`,
          diseaseOrCondition: ind.disease,
          ageGroup: ind.ageGroup,
          sex,
          healthDomain: ind.domain,
          tags: [ind.domain, "WHO", ind.code],
          recordType: "indicator",
          lastModified: new Date().toISOString(),
        });
      }

      url = json["@odata.nextLink"];
    }

    // Rate-limit courtesy: 300ms between indicator requests
    await new Promise((r) => setTimeout(r, 300));
  }

  return records;
}

