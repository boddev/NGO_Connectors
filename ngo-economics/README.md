# NGO Economic Development & Finance — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available economic development and finance data from the World Bank, UNDP, and Our World in Data into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Development Indicators | REST API | ~40,000+ | None |
| UNDP Human Development Index | CSV Download | ~5,000+ | None |
| Our World in Data (GDP/Population) | GitHub CSV | ~15,000+ | None |

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
docker build -t ngo-economics-connector .
az containerapp up --name ngo-economics \
  --resource-group ngo-connectors-rg \
  --image ngo-economics-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank, OWID, UNDP
├── services/        # Microsoft Graph API client and batch ingestion
├── transform/       # Data normalization and content building
├── summaries/       # Pre-computed summary item generation
├── state/           # Crawl state persistence
└── functions/       # Azure Functions entry points
```

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Bi-weekly (1st & 15th, 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Weekly (Monday 6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Schema

### Economics-Specific Properties

| Property | Type | Purpose |
|----------|------|---------|
| `economicIndicator` | String | GDP, Poverty, Inequality, Employment, etc. |
| `gdpValue` | Double | GDP value (current USD or PPP) |
| `giniCoefficient` | Double | Income inequality measure (0–100) |
| `incomeGroup` | String | World Bank income classification |
| `developmentCategory` | String | UNDP HDI-based development level |

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Economic Development Analyst" — a Copilot agent specialized for economic development data queries. Deploy it alongside the connector to provide guided discovery.
