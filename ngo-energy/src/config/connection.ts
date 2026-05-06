export const connectionId = "ngoenergy";
export const connectionName = "NGO Energy & Infrastructure Data";

export const connectionDescription =
  "Energy and infrastructure data from the World Bank, International Energy Agency (IEA), " +
  "and Our World in Data. Contains indicators on electrification rates, renewable energy adoption, " +
  "energy mix by source, clean cooking access, energy consumption per capita, and infrastructure " +
  "development. Covers 200+ countries with historical data from 2000 to present. " +
  "Used by energy analysts, development planners, and sustainability researchers " +
  "to assess energy poverty, track renewable energy transitions, and inform infrastructure " +
  "investment decisions.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://ourworldindata.org",
      "https://github.com/owid/energy-data",
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
