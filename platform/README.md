# Copilot Connector Hosting Platform

A multi-tenant control plane API for managing, monitoring, and operating Microsoft 365 Copilot Connectors (formerly Microsoft Graph Connectors). Provides tenant lifecycle management, connector registration, schema versioning, file uploads, health monitoring, alerting, and audit logging.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Express API Server                       │
├──────────┬──────────┬───────────┬───────────┬──────────────────-┤
│ Tenants  │Connectors│  Uploads  │Observatory│     Registry      │
│  CRUD    │  CRUD +  │  Ingest   │  Health   │    Heartbeat      │
│  Secrets │  Schema  │  Stage    │  Alerts   │  Self-register    │
│  Audit   │  ACL     │  Validate │  Audit    │                   │
├──────────┴──────────┴───────────┴───────────┴──────────────────-┤
│    Auth (Entra ID / bypass)  │  RBAC  │  Tenant Scope  │ Audit  │
├──────────────────────────────┴────────┴────────────────┴───────-┤
│              Cosmos DB  /  Local JSON fallback                   │
│              Key Vault  /  Local secrets fallback                │
└─────────────────────────────────────────────────────────────────┘
```

**Key components:**

- **Tenant Management** — Create, update, deactivate, and offboard tenants with plan-based quotas
- **Connector Lifecycle** — Register connectors, manage schemas (draft → validate → promote), trigger crawls, check health
- **Upload Pipeline** — Accept CSV/JSON/JSONL files, validate, stage, and trigger ingestion
- **Observatory** — Platform-wide dashboard: cross-tenant connector view, 3-layer health checks, active alerts, audit log
- **Registry** — Heartbeat-based self-registration for deployed connectors
- **Internal** — Auto-discovery of NGO connectors from the filesystem
- **Health Monitor** — Background loop that polls connectors every 60s with escalating alert severity

## Prerequisites

- **Node.js 20+** and npm
- **Azure subscription** (optional for local dev — all Azure services fall back to local JSON stores)

## Quick Start

```bash
# Install dependencies
npm install

# Compile TypeScript
npx tsc

# Start the server
npx tsx src/server.ts
```

The server starts on `http://localhost:3001` with auth bypass enabled by default.

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP server port |
| `COSMOS_ENDPOINT` | _(empty)_ | Azure Cosmos DB endpoint URL. If empty, uses local JSON store in `./data/` |
| `COSMOS_KEY` | _(empty)_ | Cosmos DB primary key |
| `COSMOS_DATABASE` | `connector-platform` | Cosmos DB database name |
| `NGO_CONNECTORS_PATH` | `../` | Path to root of the NGO_Connectors repository for auto-discovery |
| `KEY_VAULT_URL` | _(empty)_ | Azure Key Vault URL. If empty, uses local secrets store in `./data/secrets.json` |
| `AUTH_BYPASS` | `true` | Set to `true` for local dev (skips Entra ID JWT validation) |
| `AUTH_TENANT_ID` | _(empty)_ | Microsoft Entra ID tenant ID for token validation |
| `AUTH_CLIENT_ID` | _(empty)_ | Entra ID app registration client ID (audience) |

## API Endpoints

### Health (no auth)

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Load balancer health check — returns `{ status, uptime, timestamp }` |

### Tenant Management

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tenants` | Create a new tenant |
| `GET` | `/api/tenants` | List all tenants |
| `GET` | `/api/tenants/:id` | Get tenant details |
| `PATCH` | `/api/tenants/:id` | Update tenant |
| `DELETE` | `/api/tenants/:id` | Soft-delete (deactivate) tenant |
| `POST` | `/api/tenants/:id/offboard` | Full offboarding flow |
| `GET` | `/api/tenants/:id/stats` | Tenant statistics |
| `POST` | `/api/tenants/:id/secrets` | Store a secret (Key Vault / local) |
| `GET` | `/api/tenants/:id/secrets` | List secret names (no values) |
| `DELETE` | `/api/tenants/:id/secrets/:name` | Delete a secret |
| `GET` | `/api/tenants/:id/audit` | Query audit log for tenant |

### Connector Management

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tenants/:id/connectors` | Register a connector |
| `GET` | `/api/tenants/:id/connectors` | List tenant's connectors |
| `GET` | `/api/tenants/:id/connectors/:cid` | Get connector detail |
| `PATCH` | `/api/tenants/:id/connectors/:cid` | Update connector config |
| `DELETE` | `/api/tenants/:id/connectors/:cid` | Remove connector |
| `POST` | `/api/tenants/:id/connectors/:cid/crawl` | Trigger crawl |
| `GET` | `/api/tenants/:id/connectors/:cid/health` | Run 3-layer health check |
| `POST` | `/api/tenants/:id/connectors/:cid/acl/validate` | Validate ACL entries |
| `POST` | `/api/tenants/:id/connectors/:cid/schema/draft` | Create schema draft |
| `POST` | `/api/tenants/:id/connectors/:cid/schema/validate` | Validate a draft schema |
| `POST` | `/api/tenants/:id/connectors/:cid/schema/promote` | Promote schema version |
| `GET` | `/api/tenants/:id/connectors/:cid/schema/versions` | List schema versions |

### Upload Pipeline

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/tenants/:id/connectors/:cid/upload` | Upload file (CSV/JSON/JSONL) |
| `GET` | `/api/tenants/:id/connectors/:cid/uploads` | List uploads |
| `DELETE` | `/api/tenants/:id/connectors/:cid/uploads/:uid` | Delete upload + purge data |
| `POST` | `/api/tenants/:id/connectors/:cid/uploads/:uid/ingest` | Trigger ingestion of staged upload |

### Observatory (platform-admin, partner-admin)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/observatory/connectors` | All connectors across tenants + discovered |
| `GET` | `/api/observatory/health` | Platform-wide health summary |
| `GET` | `/api/observatory/alerts` | Active alerts (optional `?tenantId=` filter) |
| `PATCH` | `/api/observatory/alerts/:id/acknowledge` | Acknowledge an alert |
| `PATCH` | `/api/observatory/alerts/:id/resolve` | Resolve an alert |
| `GET` | `/api/observatory/audit` | Query audit log (all tenants) |

### Registry

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/registry/heartbeat` | Connector self-registration / heartbeat |

### Internal (platform-admin only)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/internal/connectors` | Auto-discovered NGO connectors |
| `GET` | `/api/internal/connectors/:id/health` | Health check for NGO connector |
| `POST` | `/api/internal/connectors/:id/crawl` | Trigger crawl for NGO connector |

## UI Pages

The platform ships with built-in UI dashboards served as static files:

| Page | Path | Description |
|---|---|---|
| Home | `/index.html` | Platform overview and navigation |
| Observatory | `/observatory.html` | Cross-tenant connector monitoring dashboard |
| Tenants | `/tenants.html` | Tenant management interface |
| Uploads | `/uploads.html` | File upload and ingestion management |
| Alerts | `/alerts.html` | Active alerts with acknowledge/resolve actions |
| Audit | `/audit.html` | Audit log viewer with filters |

## Deployment

### Local Development

```bash
cp .env.example .env
npm install
npx tsx src/server.ts
```

All Azure dependencies (Cosmos DB, Key Vault) automatically fall back to local JSON stores in `./data/`.

### Docker

```bash
docker build -t connector-platform .
docker run -p 3001:3001 -e AUTH_BYPASS=true connector-platform
```

### Docker Compose (local dev)

```bash
docker compose up --build
```

Mounts the parent `NGO_Connectors` repo read-only for connector auto-discovery.

### Azure App Service

1. Build the Docker image and push to Azure Container Registry
2. Create an App Service with the container image
3. Set environment variables in App Service Configuration
4. Set `AUTH_BYPASS=false` and configure Entra ID variables

### Azure Container Apps

1. Push the image to ACR
2. Create a Container App with the image
3. Configure environment variables and secrets
4. Enable ingress on port 3001

## Security

- **Authentication** — Microsoft Entra ID JWT validation via JWKS endpoint. Bypass mode for local development.
- **Authorization** — Role-based access control (RBAC) with hierarchy:
  - `platform-admin` — full access to everything
  - `partner-admin` — manage own tenant + sub-tenants
  - `tenant-admin` — manage own tenant
  - `tenant-operator` — trigger crawls, view (no config changes)
  - `tenant-viewer` — read-only
- **Tenant Isolation** — Tenant-scoped middleware ensures data access is restricted to the authenticated tenant
- **Audit Logging** — All mutating operations are logged with actor, action, resource, and timestamp
- **Secrets** — Tenant secrets stored in Azure Key Vault (production) or encrypted local store (dev)
- **Helmet** — HTTP security headers applied via helmet middleware

## Monitoring

- **3-Layer Health Checks** — Each connector is checked for runtime, ingestion, and search health
- **Background Health Loop** — Polls all registered connectors every 60 seconds
- **Escalating Alerts** — Warning at 3 consecutive failures, critical at 5. Auto-resolved when healthy.
- **Job Queue** — Upload pipeline with staged → ingesting → complete lifecycle
- **`GET /health`** — Simple endpoint for load balancer probes (no auth required)

## Project Structure

```
platform/
├── src/
│   ├── server.ts              # Express app + startup + health loop
│   ├── config/settings.ts     # Environment variable loading
│   ├── middleware/
│   │   ├── auth.ts            # Entra ID JWT validation
│   │   ├── rbac.ts            # Role-based access control
│   │   ├── tenantScope.ts     # Tenant isolation
│   │   ├── audit.ts           # Audit logging middleware
│   │   └── errorHandler.ts    # Global error handler
│   ├── routes/
│   │   ├── tenants.ts         # Tenant CRUD + secrets + audit
│   │   ├── connectors.ts      # Connector CRUD + schema + ACL + crawl
│   │   ├── uploads.ts         # Upload pipeline
│   │   ├── observatory.ts     # Cross-tenant monitoring
│   │   ├── registry.ts        # Heartbeat self-registration
│   │   └── internal.ts        # NGO connector discovery
│   ├── models/                # Data models + validators
│   ├── services/              # Business logic + data access
│   ├── clients/               # External API clients
│   └── types/                 # Shared TypeScript types
├── public/                    # Static UI dashboards
├── data/                      # Local JSON stores (dev fallback)
├── Dockerfile                 # Multi-stage production build
├── docker-compose.yml         # Local dev with Docker
└── .env.example               # Environment variable template
```

## License

Internal use — Microsoft.
