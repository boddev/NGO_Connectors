# NGO Human Rights & Governance — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available human rights and governance data from the World Bank, Transparency International, and Freedom House into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank WGI (6 dimensions × 2 variants) | REST API | ~30,000+ | None |
| Transparency International CPI | Local CSV | Varies | None (manual download) |
| Freedom House Freedom in the World | Local CSV | Varies | None (manual download) |

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
docker build -t ngo-humanrights-connector .
az containerapp up --name ngo-humanrights \
  --resource-group ngo-connectors-rg \
  --image ngo-humanrights-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank WGI, TI CPI, Freedom House
├── services/        # Microsoft Graph API client and batch ingestion
├── transform/       # Data normalization and content building
├── summaries/       # Pre-computed summary item generation
├── state/           # Crawl state persistence
└── functions/       # Azure Functions entry points
```

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Monthly (1st, 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Weekly (Monday 6 AM UTC) | Check for new/updated WGI data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Adding CPI Data

1. Download the latest CPI data from [transparency.org/en/cpi](https://www.transparency.org/en/cpi)
2. Convert/export to CSV with columns: `Country, ISO3, Region, CPI Score YYYY, Rank YYYY`
3. Place the file at `./state/cpi-data.csv`
4. Trigger a crawl — CPI data will be included

## Adding Freedom House Data

1. Download from [freedomhouse.org/reports](https://freedomhouse.org/reports)
2. Convert/export to CSV with columns: `Country/Territory, Region, C/T, Edition, Status, PR Rating, CL Rating, Total`
3. Place the file at `./state/freedom-house-data.csv`
4. Trigger a crawl — Freedom House data will be included

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Governance & Rights Analyst" — a Copilot agent specialized for governance and human rights data queries. Deploy it alongside the connector to provide guided discovery.
