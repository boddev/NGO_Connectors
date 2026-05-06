# NGO Conflict & Security — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available conflict and security data from ACLED, UCDP, UNODC, and the World Bank into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Conflict Indicators | REST API | ~10,000+ | None |
| ACLED (Armed Conflict Location & Event Data) | Local CSV | Varies | Registration required |
| UCDP Georeferenced Event Dataset (GED) | Local CSV | Varies | None (download ZIP) |
| UNODC Intentional Homicide Dataset | Local CSV | Varies | None |

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
cp .env.example .env
# Edit .env with your Tenant ID, Client ID, and Client Secret

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
docker build -t ngo-conflict-connector .
az containerapp up --name ngo-conflict \
  --resource-group ngo-connectors-rg \
  --image ngo-conflict-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank, ACLED, UCDP, UNODC
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
| `incrementalCrawl` | Daily (6 AM UTC) | Check World Bank API for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Adding ACLED Data

1. Register at [developer.acleddata.com](https://developer.acleddata.com)
2. Export conflict event data as CSV from the [data export tool](https://acleddata.com/data-export-tool/)
3. Place the file at `./state/acled-export.csv`
4. Trigger a crawl — ACLED data will be included

## Adding UCDP Data

1. Download GED CSV from [ucdp.uu.se/downloads](https://ucdp.uu.se/downloads/)
2. Extract the CSV from the ZIP file
3. Place the file at `./state/ucdp-ged-export.csv`
4. Trigger a crawl — UCDP data will be included

## Adding UNODC Data

1. Visit [dataunodc.un.org](https://dataunodc.un.org/)
2. Select "Intentional Homicide" dataset and export as CSV
3. Place the file at `./state/unodc-homicide-export.csv`
4. Trigger a crawl — UNODC data will be included

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Conflict & Security Analyst" — a Copilot agent specialized for conflict and security data queries. Deploy it alongside the connector to provide guided discovery.
