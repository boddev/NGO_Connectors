export const connectionId = "ngowash";
export const connectionName = "NGO Water, Sanitation & Hygiene Data";

export const connectionDescription =
  "Water, sanitation, and hygiene (WASH) data from the World Bank and the " +
  "WHO-UNICEF Joint Monitoring Programme (via Our World in Data). Contains indicators on " +
  "access to clean drinking water, sanitation service levels, hygiene facility coverage, " +
  "safely managed vs. basic service tiers, and urban-rural disparities. " +
  "Covers 200+ countries with data from 2000 to present. " +
  "Used by WASH program managers, public health professionals, and development planners " +
  "to assess water access, prioritize interventions, and track SDG 6 progress.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://data.worldbank.org",
      "https://ourworldindata.org",
      "https://washdata.org",
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
