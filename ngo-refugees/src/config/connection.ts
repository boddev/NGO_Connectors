export const connectionId = "ngorefugees";
export const connectionName = "NGO Refugees, Migration & Displacement Data";

export const connectionDescription =
  "Refugee, migration, and displacement data from UNHCR and the World Bank. " +
  "Contains statistics on refugee populations, asylum seekers, internally displaced persons (IDPs), " +
  "stateless persons, migration flows, remittances, and displacement tracking. " +
  "Covers 200+ countries with data from 2000 to present. " +
  "Used by humanitarian coordinators, migration researchers, and policy analysts " +
  "to monitor forced displacement, understand migration patterns, and assess protection needs.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://www.unhcr.org",
      "https://data.worldbank.org",
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
