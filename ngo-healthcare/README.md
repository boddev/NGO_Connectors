# NGO Healthcare & Public Health — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available healthcare and public health data from the World Bank and WHO Global Health Observatory into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Health Indicators | REST API | ~30,000+ | None |
| WHO Global Health Observatory (GHO) | REST API | ~20,000+ | None |

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
docker build -t ngo-healthcare-connector .
az containerapp up --name ngo-healthcare \
  --resource-group ngo-connectors-rg \
  --image ngo-healthcare-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank and WHO GHO
├── services/        # Microsoft Graph API client and batch ingestion
├── transform/       # Data normalization and content building
├── summaries/       # Pre-computed summary item generation
├── state/           # Crawl state persistence
└── functions/       # Azure Functions entry points
```

## Schema

### Common Properties (14 — shared across all NGO connectors)
`title`, `itemUrl`, `iconUrl`, `lastModified`, `sourceOrganization`, `datasetName`, `country`, `region`, `year`, `indicatorName`, `indicatorValue`, `tags`, `recordType`, `dataSourceUrl`

### Healthcare-Specific Properties (5)
| Property | Type | Purpose |
|----------|------|---------|
| `diseaseOrCondition` | String | Disease, condition, or risk factor name |
| `ageGroup` | String | Target age group (e.g., "Under 5", "15-49") |
| `sex` | String | Sex disaggregation (Male, Female, Both) |
| `measureUnit` | String | Unit of measurement |
| `healthDomain` | String | Health topic area (e.g., "Immunization", "Maternal Health") |

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Weekly (Sun 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Daily (6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Health Indicators

### World Bank (15 indicators)
- Under-5 mortality, neonatal mortality, maternal mortality ratio
- Life expectancy at birth
- Measles and DPT immunization coverage
- TB incidence, HIV incidence
- Health expenditure (per capita and % GDP)
- Physicians and hospital beds per 1,000 people
- Stunting prevalence, unsafe water mortality, smoking prevalence

### WHO GHO (6 indicators)
- Life expectancy at birth (with sex disaggregation)
- Under-5 mortality rate, neonatal mortality rate
- Maternal mortality ratio
- Measles immunization coverage
- Healthy life expectancy at birth

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Health Analyst" — a Copilot agent specialized for healthcare data queries. Deploy it alongside the connector to provide guided discovery.
