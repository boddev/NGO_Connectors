import { Request, Response, NextFunction, RequestHandler } from "express";
import { PlatformRole } from "../types";

/**
 * Role hierarchy (most → least privileged):
 *
 *   platform-admin   — full access to everything
 *   partner-admin    — manage own tenant + sub-tenants, upload, crawl, view
 *   tenant-admin     — manage own tenant, upload, crawl, view
 *   tenant-operator  — trigger crawls, view (no config changes)
 *   tenant-viewer    — read-only
 */

/**
 * Express middleware factory that requires the authenticated user to hold
 * at least one of the specified roles.
 *
 * `platform-admin` implicitly satisfies every role check.
 *
 * @example
 *   router.get('/admin-only', requireRole('platform-admin'), handler);
 *   router.post('/crawl',     requireRole('tenant-admin', 'tenant-operator'), handler);
 */
export function requireRole(...roles: PlatformRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // platform-admin bypasses all role checks
    if (user.roles.includes("platform-admin")) {
      return next();
    }

    const hasRole = roles.some((role) => user.roles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        current: user.roles,
      });
      return;
    }

    next();
  };
}
