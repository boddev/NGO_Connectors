import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { connectionId, connectionName } from "../config/connection.js";
import { loadCrawlState, saveCrawlState, loadCrawlStateWithFallback } from "../state/crawlState.js";
import * as fs from "node:fs";
import * as path from "node:path";

/** GET /api/dashboard — serves the admin HTML page */
async function serveDashboard(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const htmlPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "public",
    "dashboard.html"
  );

  let html: string;
  try {
    html = fs.readFileSync(htmlPath, "utf-8");
  } catch {
    // Fallback: try relative to cwd
    const fallback = path.join(process.cwd(), "public", "dashboard.html");
    try {
      html = fs.readFileSync(fallback, "utf-8");
    } catch {
      return { status: 404, body: "Dashboard HTML not found" };
    }
  }

  return {
    status: 200,
    headers: { "Content-Type": "text/html" },
    body: html,
  };
}


/**
 * Query the Microsoft Graph external connection for real state.
 */
async function getGraphConnectionInfo(): Promise<{
  currentItems: number;
  state: string;
} | null> {
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;

  try {
    const tokenResp = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }),
      }
    );
    if (!tokenResp.ok) return null;
    const tokenData = (await tokenResp.json()) as { access_token: string };

    const connResp = await fetch(
      `https://graph.microsoft.com/v1.0/external/connections/${connectionId}`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    if (!connResp.ok) return null;
    const connData = (await connResp.json()) as {
      state?: string;
    };

    return {
      currentItems: 0,
      state: connData.state ?? "unknown",
    };
  } catch {
    return null;
  }
}
/** GET /api/dashboard/status — returns connector status as JSON */
async function getStatus(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const dataSourceUrls: Record<string, string> = {
    reliefweb: "https://reliefweb.int",
    hdx: "https://data.humdata.org",
    ifrcEvents: "https://go.ifrc.org",
    ifrcAppeals: "https://go.ifrc.org",
  };

  const state = await loadCrawlStateWithFallback();

  return {
    status: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    jsonBody: {
      connectorId: connectionId,
      connectorName: connectionName,
      crawlStatus: state.crawlStatus,
      lastFullCrawl: state.lastFullCrawl,
      lastIncrementalCrawl: state.lastIncrementalCrawl,
      lastIncrementalReindexed: state.lastIncrementalReindexed,
      itemsIndexed: state.knownItemIds.length,
      fullCrawlSchedule: state.fullCrawlSchedule,
      incrementalCron: state.incrementalCron,
      graphConnection: await (async () => {
        try {
          const info = await getGraphConnectionInfo();
          if (info && info.state === "ready") return "ready";
        } catch {}
        return state.knownItemIds.length > 0 ? "ready" : "not provisioned";
      })(),
      sources: Object.entries(state.sources).map(([name, info]) => ({
        name,
        enabled: info.enabled,
        lastSync: info.lastSync,
        itemCount: info.itemCount,
        dataSourceUrl: dataSourceUrls[name] ?? "",
      })),
    },
  };
}

/** PATCH /api/dashboard/schedule — update crawl schedule */
async function updateSchedule(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const body = (await request.json()) as {
    fullCrawlDays?: boolean[];
    fullCrawlCron?: string;
    incrementalCron?: string;
  };

  const state = loadCrawlState();

  if (body.fullCrawlDays) {
    state.fullCrawlSchedule.days = body.fullCrawlDays;
  }
  if (body.fullCrawlCron) {
    state.fullCrawlSchedule.cron = body.fullCrawlCron;
  }
  if (body.incrementalCron) {
    state.incrementalCron = body.incrementalCron;
  }

  saveCrawlState(state);

  return {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    jsonBody: { message: "Schedule updated", schedule: state.fullCrawlSchedule },
  };
}

/** PATCH /api/dashboard/sources — toggle data sources on/off */
async function updateSources(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const body = (await request.json()) as Record<string, boolean>;
  const state = loadCrawlState();

  for (const [sourceName, enabled] of Object.entries(body)) {
    if (state.sources[sourceName]) {
      state.sources[sourceName].enabled = enabled;
    }
  }

  saveCrawlState(state);

  return {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    jsonBody: { message: "Sources updated", sources: state.sources },
  };
}

/** OPTIONS handler for CORS */
async function corsHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  };
}

app.http("dashboard", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard",
  handler: serveDashboard,
});

app.http("dashboardStatus", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "dashboard/status",
  handler: getStatus,
});

app.http("dashboardSchedule", {
  methods: ["PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/schedule",
  handler: (req, ctx) =>
    req.method === "OPTIONS" ? corsHandler(req, ctx) : updateSchedule(req, ctx),
});

app.http("dashboardSources", {
  methods: ["PATCH", "OPTIONS"],
  authLevel: "anonymous",
  route: "dashboard/sources",
  handler: (req, ctx) =>
    req.method === "OPTIONS" ? corsHandler(req, ctx) : updateSources(req, ctx),
});

