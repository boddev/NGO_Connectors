export const connectionId = "ngoeducation";
export const connectionName = "NGO Education & Literacy Data";

export const connectionDescription =
  "Global education and literacy data from the World Bank and Our World in Data. " +
  "Contains indicators on school enrollment (primary, secondary, tertiary, pre-primary), " +
  "completion rates, adult and youth literacy, education spending as percentage of GDP, " +
  "expected years of schooling, educational attainment, and gender parity in education. " +
  "Covers 200+ countries with historical data from 2000 to present. " +
  "Used by education researchers, policymakers, and development professionals " +
  "to analyze education access, quality, and equity across countries and regions.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://ourworldindata.org",
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
