# Copilot Connector Hosting Platform — Development Plan

## Problem Statement

Build a multi-tenant platform for hosting, observing, and operating Microsoft 365 Copilot Connectors. The platform serves two audiences:

1. **Internal operations** — Monitor and manage the 16 NGO industry connectors, detect online/offline status, link to admin dashboards, track health across Azure Functions and Azure Container Apps.

2. **Customer/Partner hosting** — Enable external customers and partners to register, deploy connectors for their end-users, optionally upload data to be ingested, set refresh schedules, and monitor their connectors — all through a self-service portal.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PLATFORM CONTROL PLANE                              │
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Platform API   │  │ Platform UI   │  │ Tenant       │  │ ACL          │  │
│  │ (Node.js /     │  │ (React SPA,   │  │ Registry     │  │ Validation   │  │
│  │  Express)      │  │  Azure Static │  │ (Cosmos DB)  │  │ Service      │  │
│  │                │  │  Web App)     │  │              │  │              │  │
│  └───────┬───────┘  └──────────────┘  └──────────────┘  └──────────────┘  │
│          │                                                                  │
│  ┌───────┴───────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Connector      │  │ Data Upload   │  │ Health       │  │ Job          │  │
│  │ Registry &     │  │ Service       │  │ Monitor      │  │ Orchestrator │  │
│  │ Discovery      │  │ (Blob +       │  │ (3-layer)    │  │ (Queue +     │  │
│  │                │  │  Validation)  │  │              │  │  Durable)    │  │
│  └───────────────┘  └───────────────┘  └──────────────┘  └──────────────┘  │
│                                                                             │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────┐                    │
│  │ Schema         │  │ Secret        │  │ Audit &      │                    │
│  │ Version        │  │ Manager       │  │ Compliance   │                    │
│  │ Manager        │  │ (Key Vault)   │  │ Logger       │                    │
│  └───────────────┘  └───────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA PLANE (Per-Tenant Isolated)                     │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐                        │
│  │ Tenant A             │  │ Tenant B             │                        │
│  │ ┌──────────────────┐ │  │ ┌──────────────────┐ │                        │
│  │ │ Blob Container   │ │  │ │ Blob Container   │ │                        │
│  │ │ (uploads, staged) │ │  │ │ (uploads, staged) │ │                        │
│  │ ├──────────────────┤ │  │ ├──────────────────┤ │                        │
│  │ │ Key Vault Secrets│ │  │ │ Key Vault Secrets│ │                        │
│  │ ├──────────────────┤ │  │ ├──────────────────┤ │                        │
│  │ │ Connector(s)     │ │  │ │ Connector(s)     │ │                        │
│  │ │ (Functions or    │ │  │ │ (Functions or    │ │                        │
│  │ │  Container Apps) │ │  │ │  Container Apps) │ │                        │
│  │ ├──────────────────┤ │  │ ├──────────────────┤ │                        │
│  │ │ Entra App Reg    │ │  │ │ Entra App Reg    │ │                        │
│  │ │ (tenant-owned)   │ │  │ │ (tenant-owned)   │ │                        │
│  │ └──────────────────┘ │  │ └──────────────────┘ │                        │
│  └──────────────────────┘  └──────────────────────┘                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Azure Monitor / App Insights (centralized telemetry, tenant-tagged)  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Design Decisions

### 1. Tenant Isolation Model

**Decision: Per-tenant data plane isolation with shared control plane.**

| Layer | Isolation Level | Implementation |
|-------|----------------|----------------|
| **Control plane** | Shared (multi-tenant) | Single Platform API + UI serving all tenants |
| **Blob storage** | Per-tenant container | `tenant-{id}/` prefix or separate storage account for large tenants |
| **Key Vault secrets** | Per-tenant secret scope | Tenant-prefixed secrets in shared vault, or dedicated vault for large tenants |
| **Job queue** | Per-tenant queue or partition | Prevent one tenant's crawl jobs from starving others |
| **Connectors** | Per-tenant deployment | Each tenant gets their own Functions app or Container App |
| **Entra app registration** | Per-tenant identity | Customer creates app reg in their tenant; platform stores only the connection reference |
| **Telemetry** | Shared App Insights, tenant-tagged | Every log/metric includes `tenantId` dimension for filtering |

**Enforcement:** Every API call, job execution, blob path, queue message, and telemetry record is tenant-scoped. Middleware validates tenant ownership on every request.

### 2. Graph Connection Ownership Model

**Decision: Customer-tenant-owned app identity.**

Each customer/partner registers their own Entra ID app in their tenant with:
- `ExternalConnection.ReadWrite.OwnedBy`
- `ExternalItem.ReadWrite.OwnedBy`

The platform stores only a reference to the customer's app registration (client ID + tenant ID). Credentials (client secret or certificate) are stored in the customer's scope of Key Vault, never in platform-owned storage.

**Benefits:**
- Clean admin consent flow — customer's IT admin consents within their own tenant
- Blast radius contained — compromised creds affect only that customer's connections
- Clean offboarding — revoking the app reg instantly cuts off Graph access
- Audit trail — Graph API calls originate from the customer's identity

### 3. Upload Data Handling

**Decision: Short-lived staging with strict TTL, validation, and tenant-scoped encryption.**

| Policy | Value |
|--------|-------|
| Max upload size | 500 MB per file |
| Retention | 7 days after successful ingestion, then auto-purged |
| Encryption | AES-256 at rest, tenant-scoped managed keys |
| Validation | Schema validation, malware scan (Microsoft Defender for Storage), content-type check |
| Quarantine | Uploads that fail validation are moved to quarantine container, not processed |
| Supported formats | CSV, JSON, JSONL |

**Flow:**
```
Upload → Malware Scan → Schema Validation → Staging Blob → Ingestion Job → Graph API
                                                                              ↓
                                                           Purge staging after 7 days
```

Customers who prefer not to upload data can instead configure their connector to pull directly from their own source system API.

### 4. ACL Mapping & Validation

**Decision: ACL as a first-class service with validation gates.**

| Capability | Implementation |
|------------|----------------|
| ACL resolution | Validate all Entra object IDs via Graph before ingestion |
| External groups | Platform manages external group lifecycle for non-Entra permission models |
| ACL test harness | Before first production crawl, run ACL spot-check with sample user personas |
| Drift detection | Weekly reconciliation: compare ingested ACLs against source system permissions |
| Blocking gate | If >5% of items have unresolvable ACL entries, block ingestion and alert |

### 5. Health Monitoring — Three Layers

| Layer | What It Checks | How | Alert Threshold |
|-------|---------------|-----|-----------------|
| **Runtime Health** | Process alive, endpoint responsive | HTTP health probe every 60s | 3 consecutive failures |
| **Ingestion Health** | Crawl success/failure, item throughput, 429 rate, dead letters | Post-crawl telemetry event | >10% item failure rate |
| **Search Health** | Connection active in Graph, schema completed, item count matches, Copilot discoverable | Graph API query every 6 hours | Connection paused/failed, item count drift >20% |

---

## Platform Components

### Component 1: Platform API

**Technology:** Node.js + Express + TypeScript, hosted on Azure App Service or Azure Functions

**Endpoints:**

```
── Tenant Management ──
POST   /api/tenants                          Register new tenant
GET    /api/tenants                          List all tenants (admin)
GET    /api/tenants/{id}                     Get tenant details
PATCH  /api/tenants/{id}                     Update tenant config
DELETE /api/tenants/{id}                     Offboard tenant (full cleanup)

── Connector Management ──
POST   /api/tenants/{id}/connectors          Register connector for tenant
GET    /api/tenants/{id}/connectors          List tenant's connectors
GET    /api/tenants/{id}/connectors/{cid}    Get connector details + status
PATCH  /api/tenants/{id}/connectors/{cid}    Update connector config
DELETE /api/tenants/{id}/connectors/{cid}    Remove connector
POST   /api/tenants/{id}/connectors/{cid}/provision    Provision Graph connection
POST   /api/tenants/{id}/connectors/{cid}/crawl        Trigger crawl
GET    /api/tenants/{id}/connectors/{cid}/health       3-layer health check
GET    /api/tenants/{id}/connectors/{cid}/dashboard    Link to connector admin UI

── Data Upload ──
POST   /api/tenants/{id}/connectors/{cid}/upload       Upload CSV/JSON data
GET    /api/tenants/{id}/connectors/{cid}/uploads       List upload history
DELETE /api/tenants/{id}/connectors/{cid}/uploads/{uid}  Delete upload

── Schema Management ──
POST   /api/tenants/{id}/connectors/{cid}/schema/validate   Validate schema draft
POST   /api/tenants/{id}/connectors/{cid}/schema/promote    Promote schema to active
GET    /api/tenants/{id}/connectors/{cid}/schema/versions    Schema version history

── Observatory (cross-tenant, admin only) ──
GET    /api/observatory/connectors           All connectors across all tenants
GET    /api/observatory/health               Platform-wide health summary
GET    /api/observatory/alerts               Active alerts
GET    /api/observatory/quota                M365 quota usage across tenants

── Internal NGO Connectors ──
GET    /api/internal/connectors              Our 16 NGO connectors status
GET    /api/internal/connectors/{id}/health  Health for specific NGO connector
POST   /api/internal/connectors/{id}/crawl   Trigger crawl for NGO connector
```

### Component 2: Platform UI

**Technology:** React + TypeScript, Azure Static Web App, Entra ID MSAL authentication

**Views:**

| View | Description | Audience |
|------|-------------|----------|
| **Observatory Dashboard** | Card grid of all connectors — online/offline badge, item counts, last crawl, dashboard links | Platform admin |
| **Tenant Management** | CRUD for customer/partner tenants, onboarding wizard | Platform admin |
| **Tenant Portal** | Per-tenant view: their connectors, upload history, crawl status | Tenant admin |
| **Connector Detail** | Deep-dive: 3-layer health, crawl history, error log, schema versions, data source toggles | Tenant admin |
| **Data Upload** | Drag-and-drop CSV/JSON upload, validation results, ingestion progress | Tenant admin |
| **Alerts & Notifications** | Active alerts, historical incidents, resolution status | All roles |
| **NGO Connectors** | Our 16 NGO connectors with inline admin dashboard links | Platform admin |

### Component 3: Connector Registry & Discovery

**Primary mechanism: Registration-based inventory (not blind Azure scanning).**

Each connector registers itself with the platform control plane on startup and sends heartbeats every 60 seconds.

```typescript
// Connector startup registration payload
{
  connectorId: "ngoenvironment",
  tenantId: "internal",
  hostingType: "azure-functions" | "container-apps",
  endpoints: {
    provision: "https://ngo-env.azurewebsites.net/api/provision",
    fullCrawl: "https://ngo-env.azurewebsites.net/api/onDemandCrawl",
    dashboard: "https://ngo-env.azurewebsites.net/api/dashboard",
    health: "https://ngo-env.azurewebsites.net/api/dashboard/status"
  },
  version: "1.0.0",
  dataSources: ["worldBank", "owid", "emdat"],
  lastHeartbeat: "2026-04-23T17:00:00Z"
}
```

**Reconciliation:** Azure Resource Graph queries run daily as a secondary check to detect unregistered connectors (tagged with `copilot-connector: true`). These appear as "unregistered" in the observatory for admin review.

### Component 4: Data Upload Service

**Technology:** Azure Blob Storage + Azure Functions event trigger + Microsoft Defender for Storage

**Flow:**
1. Tenant uploads CSV/JSON via Platform API → file stored in `tenant-{id}/uploads/{connectorId}/{uploadId}/`
2. Defender for Storage scans for malware (async, <5 min)
3. Schema validator checks column names/types against connector schema
4. If valid → move to `tenant-{id}/staging/{connectorId}/` → trigger ingestion job
5. If invalid → move to `tenant-{id}/quarantine/` → alert tenant admin
6. After successful ingestion → mark upload as "ingested" in Cosmos DB
7. TTL: Auto-purge staged files after 7 days

### Component 5: Health Monitor

**Technology:** Azure Functions (timer-triggered) + Application Insights + Azure Monitor Alerts

**Checks:**

| Check | Frequency | Method | Action on Failure |
|-------|-----------|--------|-------------------|
| Runtime health | 60s | HTTP GET to connector health endpoint | Mark offline after 3 failures; alert |
| Crawl health | Post-crawl | Parse crawl result from Cosmos DB | Alert if >10% item failures |
| Search health | 6 hours | Graph API: GET /external/connections/{id} | Alert if connection paused/failed |
| Quota check | Daily | Graph API: quota usage | Alert at 80% threshold |
| Upload scan | On upload | Defender for Storage event | Quarantine if malware detected |
| ACL drift | Weekly | Compare ingested ACLs vs source | Alert if >5% unresolvable |

**Failure Classification:**

| Failure Type | Action | Requires Human? |
|-------------|--------|-----------------|
| Transient (429, network timeout) | Auto-retry with backoff | No |
| Configuration (bad creds, expired secret) | Pause tenant connector, alert admin | Yes |
| Destructive drift (connection deleted) | Auto-recreate connection + schema + full crawl | No (auto-recovery) |
| Data quality (bad upload, schema mismatch) | Quarantine upload, alert tenant | Yes |
| Quota exhausted | Pause ingestion, alert platform admin | Yes |

### Component 6: Job Orchestrator

**Technology:** Azure Queue Storage + Azure Durable Functions

**Job Types:**

| Job | Trigger | Isolation |
|-----|---------|-----------|
| Full crawl | Timer, on-demand, upload complete | Per-tenant queue partition |
| Incremental crawl | Timer | Per-tenant queue partition |
| Health check | Timer | Shared (lightweight) |
| Upload processing | Blob event | Per-tenant queue |
| ACL reconciliation | Timer (weekly) | Per-tenant |
| Quota check | Timer (daily) | Shared |

**Fair scheduling:** Per-tenant concurrency limit (max 2 concurrent crawl jobs per tenant) prevents large tenants from starving others.

### Component 7: Schema Version Manager

**Lifecycle:** Draft → Validate → Promote → Active

| Operation | What Happens |
|-----------|-------------|
| Draft | Tenant submits schema JSON; stored in Cosmos with version number |
| Validate | Platform checks schema rules (searchable/refinable exclusivity, label requirements, limits) |
| Promote | Schema registered with Graph API; old items remain until re-indexed |
| Rollback | Previous schema version can be re-promoted; requires full re-ingestion |

### Component 8: Audit & Compliance Logger

Every action is logged with:
- `timestamp`, `tenantId`, `userId`, `action`, `resource`, `details`, `result`
- Stored in Azure Log Analytics with 90-day retention (configurable)
- Exportable for compliance audits

**Audited Actions:**
- Tenant onboarding/offboarding
- Connector CRUD
- Data upload/delete
- Crawl triggers (manual + scheduled)
- Schema changes
- ACL modifications
- Secret rotation
- Configuration changes
- Admin access to tenant data

---

## RBAC Model

| Role | Scope | Permissions |
|------|-------|------------|
| **Platform Admin** | Global | Full access: all tenants, observatory, alerts, NGO connectors |
| **Partner Admin** | Their tenant + sub-tenants | Manage connectors, upload data, view health, manage sub-tenant users |
| **Tenant Admin** | Their tenant only | Manage their connectors, upload data, view health, trigger crawls |
| **Tenant Operator** | Their tenant only | View health, trigger crawls, view upload history (no config changes) |
| **Tenant Viewer** | Their tenant only | Read-only: view status, health, crawl history |

**Implementation:** Entra ID app roles + custom claims validated in API middleware.

---

## Onboarding Flow

```
1. Partner/Customer signs up via Platform UI
2. Platform creates tenant record in Cosmos DB
3. Customer registers Entra ID app in their tenant
   - Platform provides step-by-step instructions
   - Required permissions: ExternalConnection.ReadWrite.OwnedBy + ExternalItem.ReadWrite.OwnedBy
4. Customer enters app details (tenant ID, client ID) in Platform UI
5. Customer stores client secret in platform's Key Vault (tenant-scoped)
6. Customer grants admin consent in their Entra admin center
7. Customer selects connector template or provides custom schema
8. Platform provisions connector infrastructure:
   - Azure Functions app or Container App (based on preference)
   - Blob storage container for uploads
   - Job queue partition
9. Platform registers connector in the registry
10. Customer triggers first crawl or uploads data
11. Platform monitors health and sends welcome confirmation
```

## Offboarding Flow

```
1. Tenant admin or platform admin initiates offboarding
2. Platform pauses all active crawl jobs for the tenant
3. Platform deletes all Graph connections owned by the tenant's app
4. Platform purges all uploaded data from Blob storage
5. Platform deletes tenant secrets from Key Vault
6. Platform decommissions tenant's Functions app / Container App
7. Platform marks tenant as "deactivated" in Cosmos DB (soft delete for 30 days)
8. Audit trail exported and retained per compliance policy
9. After 30-day grace period, hard delete all tenant records
```

---

## Technology Stack

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Platform API | Node.js + Express + TypeScript | Azure App Service (or Azure Functions) |
| Platform UI | React + TypeScript + Fluent UI | Azure Static Web Apps |
| Tenant Registry | Azure Cosmos DB (NoSQL) | Serverless tier |
| Upload Storage | Azure Blob Storage | Tenant-partitioned containers |
| Job Orchestrator | Azure Durable Functions + Queue Storage | Consumption plan |
| Secret Management | Azure Key Vault | Per-tenant secret scope |
| Health Monitoring | Azure Functions (timer) + App Insights + Azure Monitor | Consumption plan |
| Audit Logging | Azure Log Analytics | 90-day retention |
| Authentication | Microsoft Entra ID (MSAL) | — |
| Malware Scanning | Microsoft Defender for Storage | — |
| CI/CD | GitHub Actions | — |

---

## Data Model (Cosmos DB)

### Tenants Collection

```json
{
  "id": "tenant-uuid",
  "partitionKey": "tenant-uuid",
  "name": "Acme Foundation",
  "type": "customer" | "partner",
  "status": "active" | "suspended" | "deactivated",
  "entraAppRegistration": {
    "tenantId": "customer-entra-tenant-id",
    "clientId": "customer-app-client-id"
  },
  "plan": "free" | "standard" | "enterprise",
  "quotas": {
    "maxConnectors": 5,
    "maxUploadSizeMB": 500,
    "maxItemsPerDay": 50000,
    "maxConcurrentCrawls": 2
  },
  "contacts": {
    "admin": "admin@acme.org",
    "technical": "dev@acme.org"
  },
  "createdAt": "2026-04-23T17:00:00Z",
  "updatedAt": "2026-04-23T17:00:00Z"
}
```

### Connectors Collection

```json
{
  "id": "connector-uuid",
  "partitionKey": "tenant-uuid",
  "tenantId": "tenant-uuid",
  "connectionId": "acme-helpdesk",
  "displayName": "Acme Helpdesk Tickets",
  "hostingType": "azure-functions" | "container-apps",
  "status": "online" | "offline" | "provisioning" | "error",
  "endpoints": {
    "provision": "https://...",
    "fullCrawl": "https://...",
    "incrementalCrawl": "https://...",
    "dashboard": "https://...",
    "health": "https://..."
  },
  "dataSources": [
    { "name": "api", "enabled": true, "lastSync": "...", "itemCount": 5000 },
    { "name": "csv-upload", "enabled": false, "lastSync": null, "itemCount": 0 }
  ],
  "schemaVersion": "v3",
  "crawlSchedule": {
    "fullCrawlCron": "0 0 2 * * 0",
    "incrementalCron": "0 0 6 * * *"
  },
  "health": {
    "runtime": "healthy",
    "ingestion": "healthy",
    "search": "healthy",
    "lastChecked": "2026-04-23T17:00:00Z"
  },
  "lastHeartbeat": "2026-04-23T17:00:00Z",
  "createdAt": "2026-04-23T17:00:00Z"
}
```

### Uploads Collection

```json
{
  "id": "upload-uuid",
  "partitionKey": "tenant-uuid",
  "tenantId": "tenant-uuid",
  "connectorId": "connector-uuid",
  "fileName": "tickets-export.csv",
  "format": "csv" | "json" | "jsonl",
  "sizeMB": 45.2,
  "status": "scanning" | "validating" | "staged" | "ingesting" | "ingested" | "quarantined" | "purged",
  "recordCount": 12500,
  "validationResult": { "valid": true, "errors": [] },
  "ingestionResult": { "succeeded": 12480, "failed": 20, "errors": ["..."] },
  "uploadedAt": "2026-04-23T16:00:00Z",
  "ingestedAt": "2026-04-23T16:15:00Z",
  "purgeAfter": "2026-04-30T16:15:00Z"
}
```

---

## Implementation Phases

### Phase 1: Foundation & Observatory
- Platform API scaffolding (Express + TypeScript)
- Cosmos DB setup with tenant, connector, and upload collections
- Connector registry with heartbeat-based discovery
- Observatory dashboard: shows all 16 NGO connectors with online/offline status and admin dashboard links
- Entra ID authentication for platform UI
- Health monitoring: runtime layer (HTTP probes)

### Phase 2: Tenant Management & Onboarding
- Tenant CRUD API and onboarding wizard UI
- RBAC implementation (5 roles)
- Entra app registration guidance flow
- Per-tenant Key Vault secret management
- Tenant dashboard portal
- Offboarding flow with data purge

### Phase 3: Connector Hosting & Upload
- Data upload service (Blob + Defender scan + schema validation)
- Upload-triggered ingestion pipeline
- Per-tenant connector deployment (Functions or Container Apps)
- Schema version manager (draft → validate → promote)
- Upload history and status tracking

### Phase 4: Advanced Operations
- 3-layer health monitoring (runtime + ingestion + search)
- Failure classification and auto-recovery
- ACL validation service and drift detection
- Job orchestrator with fair scheduling and per-tenant concurrency limits
- Alert management and notification system (email + Teams webhook)

### Phase 5: Production Hardening
- Audit logging with Log Analytics
- Compliance controls (data residency, retention, DSR)
- Secret rotation automation
- Load testing and scale validation
- Security review and penetration testing
- Documentation and runbook creation

---

## Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| Authentication | Entra ID MSAL for all UI and API access |
| Authorization | Role-based (5 roles) with tenant-scoped middleware |
| Tenant isolation | Per-tenant Blob containers, Key Vault scopes, queue partitions |
| Secrets | Azure Key Vault, Managed Identity, never in code/config |
| Upload security | Defender for Storage malware scan, schema validation, quarantine |
| Data at rest | AES-256 encryption (Azure Storage default + tenant-scoped keys for uploads) |
| Data in transit | TLS 1.2+ on all endpoints |
| Audit trail | Every action logged with user identity, timestamp, and details |
| Data retention | Uploads purged after 7 days; audit logs retained 90 days |
| Offboarding | Full data purge within 30 days of deactivation |
| ACL validation | Pre-ingestion Entra ID resolution; block on >5% failure |
| Blast radius | Per-tenant app identity; .OwnedBy scope; documented blast radius analysis |

---

## Estimated Scale

| Metric | Capacity |
|--------|----------|
| Tenants | Up to 500 |
| Connectors per tenant | Up to 10 |
| Total connectors | Up to 5,000 |
| Concurrent crawl jobs | 50 (platform-wide) |
| Upload throughput | 100 uploads/day |
| Max upload size | 500 MB per file |
| Health check frequency | 60s (runtime), 6h (search) |
| API request rate | 1,000 req/min |

---

## Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Tenant data leakage | Critical | Per-tenant isolation at every layer; ACL validation gates |
| Credential compromise | High | Per-tenant app identity; Key Vault; Managed Identity; .OwnedBy scope |
| Noisy neighbor (one tenant's crawls slow others) | Medium | Per-tenant concurrency limits; fair scheduling; queue partitioning |
| Uploaded malware/bad data | Medium | Defender scan + schema validation + quarantine |
| Schema change breaks ingestion | Medium | Schema version manager with validate → promote lifecycle |
| Platform outage | High | Multi-region deployment; auto-recovery; connection re-creation |
| Quota exhaustion | Medium | Per-tenant quotas; 80% threshold alerts; platform-wide monitoring |
| Offboarding incomplete | Medium | Automated purge pipeline with 30-day grace period and verification |
