export const connectionId = "ngohealthcare";
export const connectionName = "NGO Healthcare & Public Health Data";

export const connectionDescription =
  "Public health and healthcare data from leading global health organizations including " +
  "the World Bank, the World Health Organization, and UNICEF. Contains indicators on " +
  "disease burden, mortality rates, immunization coverage, health system performance, " +
  "maternal and child health, life expectancy, and health risk factors. " +
  "Covers 190+ countries with data from 2000 to present. " +
  "Used by researchers, policymakers, and humanitarian professionals to analyze health " +
  "trends, compare country-level outcomes, and inform public health decisions.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://www.who.int/data/gho",
      "https://data.unicef.org",
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
