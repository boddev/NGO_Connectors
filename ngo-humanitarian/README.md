# NGO Humanitarian Aid & Disaster Relief — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available humanitarian aid and disaster relief data from ReliefWeb, HDX, and IFRC GO into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| ReliefWeb (UN OCHA) | REST API v2 | ~500+ reports | Approved appname required |
| Humanitarian Data Exchange (HDX) | CKAN API | ~200+ datasets | None |
| IFRC GO Emergency Events | REST API v2 | ~300+ events | None |
| IFRC GO Appeals | REST API v2 | ~200+ appeals | None |

## Prerequisites

- Node.js 20+
- Azure Functions Core Tools v4
- Microsoft 365 tenant with Copilot license
- Entra ID app registration with:
  - `ExternalConnection.ReadWrite.OwnedBy`
  - `ExternalItem.ReadWrite.OwnedBy`
  - Admin consent granted
- ReliefWeb approved appname (register at https://apidoc.reliefweb.int/parameters#appname)

## Quick Start

```bash
# Install dependencies
npm install

# Configure credentials
cp .env.example .env
# Edit .env with your Tenant ID, Client ID, Client Secret, and ReliefWeb appname

# Build
npm run build

# Provision the connector (creates connection + registers schema)
# Using Azure Functions Core Tools:
func start
# Then POST to http://localhost:7071/api/provision

# Trigger a full crawl
# POST to http://localhost:7071/api/onDemandCrawl
```

## Deployment

### Azure Functions

```bash
npm run build
func azure functionapp publish <your-function-app-name>
```

### Azure Container Apps

```bash
docker build -t ngo-humanitarian-connector .
az containerapp up --name ngo-humanitarian \
  --resource-group ngo-connectors-rg \
  --image ngo-humanitarian-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=... RELIEFWEB_APPNAME=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from ReliefWeb, HDX, IFRC GO
├── services/        # Microsoft Graph API client and batch ingestion
├── transform/       # Data normalization and content building
├── summaries/       # Pre-computed summary item generation
├── state/           # Crawl state persistence
└── functions/       # Azure Functions entry points
```

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Daily (2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Every 6 hours | Check for new/updated crisis data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Humanitarian-Specific Schema Properties

| Property | Type | Purpose |
|----------|------|---------|
| `crisisType` | String | Conflict, Flood, Earthquake, Drought, Epidemic, etc. |
| `emergencyStatus` | String | Active, Resolved, Monitoring, Preparedness |
| `affectedPopulation` | Int64 | Number of people affected |
| `responseOrganization` | String | Responding org (UNICEF, MSF, Red Cross, etc.) |
| `humanitarianSector` | String | Protection, Shelter, WASH, Health, Food Security, Education |

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Humanitarian Response Analyst" — a Copilot agent specialized for humanitarian crisis queries. Deploy it alongside the connector to provide guided discovery.
