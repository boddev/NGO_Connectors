# NGO Environment & Climate Change — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available environmental and climate change data from the World Bank, Our World in Data, and EM-DAT into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Climate Indicators | REST API | ~30,000+ | None |
| Our World in Data (CO₂/GHG) | GitHub CSV | ~15,000+ | None |
| EM-DAT Disaster Database | Local CSV | Varies | Registration required |

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
docker build -t ngo-environment-connector .
az containerapp up --name ngo-environment \
  --resource-group ngo-connectors-rg \
  --image ngo-environment-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank, OWID, EM-DAT
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

## Adding EM-DAT Data

1. Register at [public.emdat.be](https://public.emdat.be)
2. Export disaster data as CSV
3. Place the file at `./state/emdat-export.csv`
4. Trigger a crawl — EM-DAT data will be included

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Climate & Environment Analyst" — a Copilot agent specialized for environmental data queries. Deploy it alongside the connector to provide guided discovery.
