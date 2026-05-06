export const connectionId = "ngohumanrights";
export const connectionName = "NGO Human Rights & Governance Data";

export const connectionDescription =
  "Human rights, governance, and democratic accountability data from the " +
  "World Bank Worldwide Governance Indicators (WGI) and Transparency International " +
  "Corruption Perceptions Index (CPI). Contains indices and indicators on control of " +
  "corruption, government effectiveness, rule of law, regulatory quality, voice and " +
  "accountability, political stability, and corruption perceptions. " +
  "Covers 200+ countries with historical data from 1996 to present. " +
  "Used by governance researchers, human rights advocates, and policy analysts " +
  "to assess and compare democratic governance, accountability, and rights " +
  "protections across countries.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://www.transparency.org",
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
