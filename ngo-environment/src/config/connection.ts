export const connectionId = "ngoenvironment";
export const connectionName = "NGO Environment & Climate Change Data";

export const connectionDescription =
  "Environmental and climate change data from the World Bank, Our World in Data, " +
  "and the EM-DAT International Disaster Database. Contains indicators on CO₂ emissions, " +
  "greenhouse gases, deforestation, biodiversity, species conservation status, " +
  "natural disasters, air quality, water pollution, renewable energy, and climate adaptation. " +
  "Covers 200+ countries with historical data from 1960 to present. " +
  "Used by environmental researchers, conservation professionals, and climate policy analysts " +
  "to track environmental change, assess biodiversity threats, compare country performance, " +
  "and inform sustainability decisions.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://ourworldindata.org",
      "https://public.emdat.be",
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
