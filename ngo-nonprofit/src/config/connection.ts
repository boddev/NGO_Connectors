export const connectionId = "ngononprofit";
export const connectionName = "NGO Nonprofit Sector & Charity Operations Data";

export const connectionDescription =
  "Nonprofit sector and charity operations data from ProPublica Nonprofit Explorer " +
  "and the UK Charity Commission. Contains information on US and UK registered nonprofits " +
  "including financial data (revenue, expenses, assets), organizational ratings, mission statements, " +
  "program areas, executive compensation, tax-exempt status, and NTEE classification codes. " +
  "Used by grant makers, researchers, donors, and nonprofit professionals to evaluate organizations, " +
  "compare financials, and understand the nonprofit sector landscape.";

export const urlToItemResolver = {
  "@odata.type":
    "#microsoft.graph.externalConnectors.itemIdResolver" as const,
  urlMatchInfo: {
    baseUrls: [
      "https://projects.propublica.org/nonprofits",
      "https://register-of-charities.charitycommission.gov.uk",
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
