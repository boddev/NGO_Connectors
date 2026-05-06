export const connectionId = "ngochildprotection";
export const connectionName = "NGO Child Protection & Welfare Data";

export const connectionDescription =
  "Child protection and welfare data from the World Bank, UNICEF (via UN IGME), " +
  "and Our World in Data. Contains indicators on under-5 mortality, infant mortality, " +
  "child labor prevalence, primary school completion, birth registration, and child stunting " +
  "for 200+ countries with historical data from 2000 to present. " +
  "Used by child rights advocates, social workers, and development organizations " +
  "to monitor threats to children, assess protection gaps, design targeted interventions, " +
  "and track progress toward Sustainable Development Goals related to child welfare.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://ourworldindata.org",
      "https://data.unicef.org",
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
