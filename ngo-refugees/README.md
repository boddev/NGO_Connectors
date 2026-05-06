# NGO Refugees, Migration & Displacement — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available refugee, migration, and displacement data from UNHCR and the World Bank into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| UNHCR Refugee Data Portal (by origin) | REST API | ~800+ | None |
| UNHCR Refugee Data Portal (by asylum) | REST API | ~800+ | None |
| World Bank Migration & Remittances | REST API | ~30,000+ | None |

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
docker build -t ngo-refugees-connector .
az containerapp up --name ngo-refugees \
  --resource-group ngo-connectors-rg \
  --image ngo-refugees-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from UNHCR and World Bank
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

## Schema Properties

### Common Properties
`title`, `itemUrl`, `iconUrl`, `lastModified`, `sourceOrganization`, `datasetName`, `country`, `region`, `year`, `indicatorName`, `indicatorValue`, `tags`, `recordType`, `dataSourceUrl`

### Refugee-Specific Properties
| Property | Type | Purpose |
|----------|------|---------|
| `displacementType` | String | Refugee, IDP, Asylum-seeker, Stateless, Migration, Remittance |
| `populationGroup` | String | Demographic group (Women, Children, etc.) |
| `countryOfOrigin` | String | Country people are displaced from |
| `countryOfAsylum` | String | Country providing asylum/hosting |
| `displacedPopulation` | Int64 | Number of displaced persons |

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Displacement Analyst" — a Copilot agent specialized for refugee and displacement data queries. Deploy it alongside the connector to provide guided discovery.
