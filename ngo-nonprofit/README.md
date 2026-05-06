# NGO Nonprofit Sector & Charity Operations — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available nonprofit sector and charity operations data from ProPublica Nonprofit Explorer and the UK Charity Commission into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| ProPublica Nonprofit Explorer | REST API | ~750+ per crawl | None |
| UK Charity Commission Register | Local CSV | Varies | None |

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
docker build -t ngo-nonprofit-connector .
az containerapp up --name ngo-nonprofit \
  --resource-group ngo-connectors-rg \
  --image ngo-nonprofit-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from ProPublica, UK Charity Commission
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

## Adding UK Charity Commission Data

1. Download bulk data from [register-of-charities.charitycommission.gov.uk](https://register-of-charities.charitycommission.gov.uk/)
2. Export or prepare a CSV with columns: `charity_number`, `charity_name`, `date_of_registration`, `date_of_removal`, `charity_activities`, `charity_objects`, `total_income`, `total_expenditure`, `charity_contact_address1`, `charity_contact_postcode`
3. Place the file at `./state/uk-charity-commission.csv`
4. Trigger a crawl — UK charity data will be included

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Nonprofit Intelligence Analyst" — a Copilot agent specialized for nonprofit sector queries. Deploy it alongside the connector to provide guided discovery.
