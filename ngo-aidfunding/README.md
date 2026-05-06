# NGO Aid Transparency & Funding Flows — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available international aid transparency and funding flow data from the World Bank and IATI into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank ODA Indicators | REST API | ~30,000+ | None |
| IATI Registry Publishers | CKAN API | ~2,000+ | None |
| IATI Datastore Activities | REST API | Varies | API Key (optional) |

## Prerequisites

- Node.js 20+
- Azure Functions Core Tools v4
- Microsoft 365 tenant with Copilot license
- Entra ID app registration with:
  - `ExternalConnection.ReadWrite.OwnedBy`
  - `ExternalItem.ReadWrite.OwnedBy`
  - Admin consent granted

## Quick Start

```bash
# Install dependencies
npm install

# Configure credentials
cp local.settings.json local.settings.json.bak
# Edit local.settings.json with your Tenant ID, Client ID, and Client Secret

# Optional: Add IATI Datastore API key for activity data
# Set IATI_API_KEY in local.settings.json

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
docker build -t ngo-aidfunding-connector .
az containerapp up --name ngo-aidfunding \
  --resource-group ngo-connectors-rg \
  --image ngo-aidfunding-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank, IATI Registry
├── services/        # Microsoft Graph API client and batch ingestion
├── transform/       # Data normalization and content building
├── summaries/       # Pre-computed summary item generation
├── state/           # Crawl state persistence
└── functions/       # Azure Functions entry points
```

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Weekly (Sun 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Daily (6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## IATI Datastore (Optional)

The IATI Datastore API requires a subscription key. To enable activity-level data:

1. Register at [IATI Developer Portal](https://developer.iatistandard.org/)
2. Obtain an API subscription key
3. Set `IATI_API_KEY` in your environment variables
4. Trigger a crawl — IATI activity data will be included

Without the API key, the connector still ingests World Bank ODA indicators and IATI Registry publisher metadata.

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Aid Funding Analyst" — a Copilot agent specialized for aid transparency and funding flow queries. Deploy it alongside the connector to provide guided discovery.
