export const connectionId = "ngomultisector";
export const connectionName = "NGO Cross-Cutting Multi-Sector Data";

export const connectionDescription =
  "Cross-cutting multi-sector development data from the World Bank and Our World in Data. " +
  "Contains indicators spanning all 17 Sustainable Development Goals and covering health, " +
  "education, poverty, environment, governance, gender, energy, and economic development " +
  "in a unified format. Includes population, GDP per capita, poverty headcount, child mortality, " +
  "adult literacy, water access, electricity access, women in parliament, and energy indicators. " +
  "Covers 200+ countries with historical data from 2000 to present. " +
  "Used as a master reference for cross-sectoral analysis, SDG progress tracking, and " +
  "multi-dimensional country comparisons that span traditional industry boundaries.";

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
