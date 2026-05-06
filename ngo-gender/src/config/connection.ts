export const connectionId = "ngogender";
export const connectionName = "NGO Gender Equality & Women's Empowerment Data";

export const connectionDescription =
  "Gender equality and women's empowerment data from the World Bank and " +
  "Our World in Data. Contains indicators on gender parity in education, " +
  "women's political participation, female labor force participation, " +
  "adolescent fertility, maternal mortality, and SDG gender targets. " +
  "Covers 200+ countries with data from 2000 to present. " +
  "Used by gender researchers, development practitioners, and advocacy " +
  "organizations to analyze gender gaps, track progress toward equality, " +
  "and inform gender-responsive policies.";

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
