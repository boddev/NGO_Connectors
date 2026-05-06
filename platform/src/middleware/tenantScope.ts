import { Request, Response, NextFunction } from "express";

/**
 * Tenant isolation middleware.
 *
 * Extracts `tenantId` from the `:id` route param and enforces that the
 * authenticated user is allowed to access that tenant's resources:
 *
 * - `platform-admin` → any tenant
 * - `partner-admin` / `tenant-admin` / `tenant-operator` / `tenant-viewer`
 *   → only their own tenant (matched by the user's tenantId claim)
 */
export function tenantScope(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tenantId = req.params.id;
  if (!tenantId) {
    // No tenant ID in the route — nothing to scope
    return next();
  }

  req.tenantId = tenantId;

  // Platform admins can access any tenant
  if (user.roles.includes("platform-admin")) {
    return next();
  }

  // All other roles can only access their own tenant
  if (user.tenantId !== tenantId) {
    res.status(403).json({
      error: "Access denied: you do not have access to this tenant",
    });
    return;
  }

  next();
}
