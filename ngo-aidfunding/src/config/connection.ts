export const connectionId = "ngoaidfunding";
export const connectionName = "NGO Aid Transparency & Funding Flows Data";

export const connectionDescription =
  "International aid transparency and funding flow data from the International Aid " +
  "Transparency Initiative (IATI) and the World Bank. Contains data on donor contributions, " +
  "aid disbursements by sector and country, ODA as percentage of GNI, net ODA received, " +
  "development project details, and transparency metrics. " +
  "Covers 200+ countries with data from 2000 to present. " +
  "Used by aid coordination professionals, policy analysts, and development researchers " +
  "to track funding flows, identify gaps, and assess transparency in international " +
  "development assistance.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://iatiregistry.org",
      "https://iatistandard.org",
    ],
    urlPattern: "/(?<itemId>[a-zA-Z0-9_-]+)",
  },
};

export const connectionPayload = {
  id: connectionId,
  name: connectionName,
  description: connectionDescription.slice(0, 512),
  activitySettings: {
    urlToItemResolvers: [urlToItemResolver],
  },
};
