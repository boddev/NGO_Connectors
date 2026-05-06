// ── Audit Middleware ─────────────────────────────────────────────────────────
//
// Wraps route handlers to automatically log the action, user, and result.

import { Request, Response, NextFunction } from "express";
import { logAudit } from "../services/auditService";

/**
 * Returns middleware that logs an audit entry for the wrapped action.
 *
 * Captures the user, tenant, request details, and response status code.
 * The entry is written after the response finishes so the result
 * (success / failure / denied) is known.
 *
 * @param action - The audit action category (e.g. "connector.create")
 */
export function auditAction(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Capture the original end/json to detect when the response completes
    const originalJson = res.json.bind(res);

    res.json = function (body?: unknown): Response {
      // Determine result from status code
      const status = res.statusCode;
      const result: "success" | "failure" | "denied" =
        status === 403 || status === 401
          ? "denied"
          : status >= 400
            ? "failure"
            : "success";

      const user = req.user;
      const tenantId =
        req.tenantId || req.params.id || user?.tenantId || "";

      // Derive the resource and resourceId from route params
      const resource = deriveResource(action);
      const resourceId =
        req.params.cid || req.params.id || "";

      logAudit({
        tenantId,
        userId: user?.id || "anonymous",
        userName: user?.name || "anonymous",
        action,
        resource,
        resourceId,
        details: {
          method: req.method,
          path: req.originalUrl,
          statusCode: status,
        },
        result,
        ipAddress: req.ip || req.socket.remoteAddress || "unknown",
      });

      return originalJson(body);
    } as Response["json"];

    next();
  };
}

/** Map action prefix to a human-readable resource name. */
function deriveResource(action: string): string {
  const prefix = action.split(".")[0];
  const map: Record<string, string> = {
    tenant: "tenant",
    connector: "connector",
    upload: "upload",
    schema: "schema",
    secret: "secret",
    alert: "alert",
    auth: "auth",
  };
  return map[prefix] || prefix;
}
