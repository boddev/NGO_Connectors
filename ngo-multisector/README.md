# NGO Cross-Cutting Multi-Sector — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available cross-cutting multi-sector development data from the World Bank and Our World in Data into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank WDI (cross-cutting) | REST API | ~30,000+ | None |
| Our World in Data (energy/CO₂) | GitHub CSV | ~15,000+ | None |

### World Bank Indicators

| Code | Indicator | SDG |
|------|-----------|-----|
| SP.POP.TOTL | Population, total | SDG 17 |
| NY.GDP.PCAP.CD | GDP per capita (current US$) | SDG 8 |
| SI.POV.DDAY | Poverty headcount at $2.15/day | SDG 1 |
| SH.DYN.MORT | Under-5 mortality rate | SDG 3 |
| SE.ADT.LITR.ZS | Adult literacy rate | SDG 4 |
| SH.H2O.BASW.ZS | Basic drinking water access | SDG 6 |
| EG.ELC.ACCS.ZS | Access to electricity | SDG 7 |
| SG.GEN.PARL.ZS | Women in parliament | SDG 5 |

### OWID Datasets

| Dataset | Indicators |
|---------|------------|
| OWID Energy Data | Renewables share, per capita electricity, carbon intensity |
| OWID CO₂ Data | CO₂ per capita, GHG per capita |

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
docker build -t ngo-multisector-connector .
az containerapp up --name ngo-multisector \
  --resource-group ngo-connectors-rg \
  --image ngo-multisector-connector \
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

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Weekly (Sun 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Daily (6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Deduplication Strategy

This connector uses the `multi-` item ID prefix to avoid collisions with industry-specific connectors:
- Multi-sector: `multi-{source}-{country}-{indicator}-{year}`
- Industry-specific connectors use their own prefixes (e.g., `wb-`, `owid-`)

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Global Data Analyst" — a master Copilot agent for cross-sector development questions. Deploy it alongside the connector to provide guided SDG-framed analysis.
