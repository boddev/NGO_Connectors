import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { AuthenticatedUser, PlatformRole } from "../types";

// ── Configuration ───────────────────────────────────────────────────────────

const AUTH_BYPASS = process.env.AUTH_BYPASS === "true";
const AUTH_TENANT_ID = process.env.AUTH_TENANT_ID || "";
const AUTH_CLIENT_ID = process.env.AUTH_CLIENT_ID || "";

// ── JWKS client (lazy-initialized only when needed) ─────────────────────────

let _jwksClient: jwksRsa.JwksClient | null = null;

function getJwksClient(): jwksRsa.JwksClient {
  if (!_jwksClient) {
    if (!AUTH_TENANT_ID) {
      throw new Error(
        "AUTH_TENANT_ID must be set when AUTH_BYPASS is not enabled"
      );
    }
    _jwksClient = jwksRsa({
      jwksUri: `https://login.microsoftonline.com/${AUTH_TENANT_ID}/discovery/v2.0/keys`,
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }
  return _jwksClient;
}

async function getSigningKey(kid: string | undefined): Promise<string> {
  if (!kid) throw new Error("JWT header missing kid");
  const key = await getJwksClient().getSigningKey(kid);
  return key.getPublicKey();
}

// ── Mock user for local development ─────────────────────────────────────────

const MOCK_USER: AuthenticatedUser = {
  id: "dev-user-00000000-0000-0000-0000-000000000000",
  name: "Dev User",
  email: "dev@localhost",
  roles: ["platform-admin"],
  tenantId: "dev-tenant",
};

// ── Middleware ───────────────────────────────────────────────────────────────

/**
 * Entra ID JWT validation middleware.
 *
 * Production: validates the Bearer token's signature via the Entra ID JWKS
 * endpoint, checks audience/issuer, and extracts user claims.
 *
 * Development: when AUTH_BYPASS=true, attaches a mock platform-admin user so
 * the API can be exercised without a real token.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // ── Dev bypass ──────────────────────────────────────────────────────────
  if (AUTH_BYPASS) {
    req.user = MOCK_USER;
    return next();
  }

  // ── Extract Bearer token ────────────────────────────────────────────────
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    // Decode header to get kid for JWKS lookup
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      res.status(401).json({ error: "Malformed token" });
      return;
    }

    // Retrieve signing key and verify signature + claims
    const signingKey = await getSigningKey(decoded.header.kid);
    const payload = jwt.verify(token, signingKey, {
      audience: AUTH_CLIENT_ID,
      issuer: [
        `https://login.microsoftonline.com/${AUTH_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${AUTH_TENANT_ID}/`,
      ],
      algorithms: ["RS256"],
    }) as jwt.JwtPayload;

    // Map Entra ID claims to AuthenticatedUser
    req.user = {
      id: payload.oid || payload.sub || "",
      name: (payload.name as string) || "",
      email:
        (payload.preferred_username as string) ||
        (payload.email as string) ||
        "",
      roles: ((payload.roles as string[]) || []) as PlatformRole[],
      tenantId: (payload.tid as string) || "",
    };

    next();
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? "Token expired"
        : err instanceof jwt.JsonWebTokenError
          ? "Token validation failed"
          : "Authentication error";
    res.status(401).json({ error: message });
  }
}
