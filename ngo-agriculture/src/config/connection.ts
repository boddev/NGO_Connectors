export const connectionId = "ngoagriculture";
export const connectionName = "NGO Agriculture & Food Security Data";

export const connectionDescription =
  "Agriculture and food security data from the Food and Agriculture Organization (FAO), " +
  "World Bank, and Our World in Data. Contains indicators on crop production, cereal yields, " +
  "arable land, food supply, agricultural productivity, hunger indices, livestock production, " +
  "and food trade. Covers 200+ countries with historical data from 1960 to present. " +
  "Used by food security analysts, agricultural researchers, and humanitarian responders " +
  "to monitor global food systems, track crop yields, compare agricultural performance, " +
  "and identify populations at risk of hunger.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://ourworldindata.org",
      "https://www.fao.org",
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
