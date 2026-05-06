export const connectionId = "ngoeconomics";
export const connectionName = "NGO Economic Development & Finance Data";

export const connectionDescription =
  "Economic development and finance data from the World Bank, UNDP, and " +
  "Our World in Data. Contains indicators on GDP, poverty, inequality, " +
  "human development, employment, population, GNI, and Sustainable Development Goals. " +
  "Covers 200+ countries with historical data from 2000 to present. " +
  "Used by development economists, policy analysts, and international development professionals " +
  "to analyze economic conditions, track progress on development goals, " +
  "and compare economic performance across countries.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://hdr.undp.org",
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
