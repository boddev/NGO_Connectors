/**
 * Health endpoint used by the platform's runtime health probe.
 * Anonymous so the platform does not need a function key.
 */
import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions";
import { connectionId } from "../config/connection.js";

const STARTED_AT = Date.now();
const VERSION = process.env.npm_package_version || "1.0.0";

async function health(
  _request: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: {
      status: "ok",
      connectorId: process.env.CONNECTOR_ID || connectionId,
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - STARTED_AT) / 1000),
      timestamp: new Date().toISOString(),
    },
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: health,
});
