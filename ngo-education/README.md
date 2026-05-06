# NGO Education & Literacy — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available education and literacy data from the World Bank and Our World in Data into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Education Indicators | REST API | ~30,000+ | None |
| Our World in Data (Literacy/Schooling) | GitHub CSV | ~7,000+ | None |

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
docker build -t ngo-education-connector .
az containerapp up --name ngo-education \
  --resource-group ngo-connectors-rg \
  --image ngo-education-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank, OWID
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
| `incrementalCrawl` | Weekly (Monday 6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Education Indicators

### World Bank (10 indicators)
- **Enrollment**: Primary, secondary, tertiary, and pre-primary gross enrollment ratios
- **Completion**: Primary completion rate
- **Literacy**: Adult literacy rate (15+), youth literacy rate (15-24)
- **Financing**: Education spending as % of GDP and % of government expenditure
- **Access**: Compulsory education duration

### Our World in Data (3 datasets)
- Cross-country literacy rates
- Expected years of schooling (UNDP)
- Learning-adjusted years of schooling (World Bank)

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Education Analyst" — a Copilot agent specialized for education and literacy data queries. Deploy it alongside the connector to provide guided discovery.
