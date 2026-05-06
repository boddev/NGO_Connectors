export const connectionId = "ngoconflict";
export const connectionName = "NGO Conflict & Security Data";

export const connectionDescription =
  "Conflict and security data from ACLED, Uppsala Conflict Data Program (UCDP), " +
  "UNODC, and the World Bank. Contains data on armed conflict events, battles, " +
  "violence against civilians, protests, riots, homicide rates, and military expenditure. " +
  "Covers 200+ countries with event-level conflict data and country-level security indicators. " +
  "Used by conflict analysts, security researchers, and humanitarian planners to monitor " +
  "security situations, assess risks, and inform crisis response decisions.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://acleddata.com",
      "https://ucdp.uu.se",
      "https://dataunodc.un.org",
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
