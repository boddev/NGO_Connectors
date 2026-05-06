export const connectionId = "ngohumanitarian";
export const connectionName = "NGO Humanitarian Aid & Disaster Relief Data";

export const connectionDescription =
  "Humanitarian aid and disaster relief data from UN OCHA, CRED, UNDRR, IFRC, and other response " +
  "organizations. Contains datasets on active humanitarian crises, disaster events, affected " +
  "populations, emergency response operations, humanitarian funding, NGO project mapping, and " +
  "disaster risk reduction. Used by humanitarian coordinators, emergency responders, and aid " +
  "workers to monitor crises, track response efforts, and identify populations in need.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://reliefweb.int",
      "https://data.humdata.org",
      "https://goadmin.ifrc.org",
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
