# NGO Water, Sanitation & Hygiene (WASH) — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available WASH data from the World Bank and Our World in Data (WHO-UNICEF JMP) into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank WASH Indicators | REST API | ~20,000+ | None |
| Our World in Data (WHO WASH, 2021) | GitHub CSV | ~30,000+ | None |

### World Bank Indicators

| Code | Indicator |
|------|-----------|
| SH.H2O.BASW.ZS | People using at least basic drinking water services (%) |
| SH.H2O.SMDW.ZS | People using safely managed drinking water services (%) |
| SH.STA.BASS.ZS | People using at least basic sanitation services (%) |
| SH.STA.SMSS.ZS | People using safely managed sanitation services (%) |
| SH.STA.HYGN.ZS | People with basic handwashing facilities (%) |

### OWID / JMP Indicators

The OWID dataset provides WHO-UNICEF JMP data disaggregated by:
- **Service**: Drinking Water, Sanitation, Hygiene
- **Level**: Safely managed, Basic, Limited, Unimproved, No service
- **Setting**: Total, Urban, Rural

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
docker build -t ngo-wash-connector .
az containerapp up --name ngo-wash \
  --resource-group ngo-connectors-rg \
  --image ngo-wash-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank and OWID
├── services/        # Microsoft Graph API client and batch ingestion
├── transform/       # Data normalization and content building
├── summaries/       # Pre-computed summary item generation
├── state/           # Crawl state persistence
└── functions/       # Azure Functions entry points
```

## Schema — WASH-Specific Properties

| Property | Type | Description |
|----------|------|-------------|
| `washService` | String | Drinking Water, Sanitation, or Hygiene |
| `serviceLevel` | String | Safely managed, Basic, Limited, Unimproved, No service |
| `coveragePercent` | Double | Percentage of population with access |
| `waterSourceType` | String | Piped, Borehole, Protected spring, Surface water, etc. |
| `urbanRural` | String | Urban, Rural, or Total |

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Monthly (1st, 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Weekly (Mon 6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO WASH Analyst" — a Copilot agent specialized for water, sanitation, and hygiene data queries. Deploy it alongside the connector to provide guided discovery.
