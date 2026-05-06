# NGO Gender Equality & Women's Empowerment — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available gender equality and women's empowerment data from the World Bank and Our World in Data into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Gender Indicators | REST API | ~30,000+ | None |
| Our World in Data (Gender) | REST API (JSON) | ~15,000+ | None |

### World Bank Indicators

| Code | Indicator | Domain |
|------|-----------|--------|
| `SG.GEN.PARL.ZS` | Women in parliament (%) | Political Participation |
| `SL.TLF.CACT.FE.ZS` | Female labor force participation (%) | Economic |
| `SE.ENR.PRSC.FM.ZS` | Gender parity index — primary & secondary | Education |
| `SP.ADO.TFRT` | Adolescent fertility rate | Health |
| `SH.STA.MMRT` | Maternal mortality ratio | Health |

### OWID Indicators

| ID | Indicator | Source |
|----|-----------|--------|
| 1209895 | Lower chamber female legislators (%) | V-Dem |
| 1205321 | Female labor force participation (%, ILO) | World Bank via OWID |
| 959831 | Maternal mortality ratio | WHO via OWID |

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
docker build -t ngo-gender-connector .
az containerapp up --name ngo-gender \
  --resource-group ngo-connectors-rg \
  --image ngo-gender-connector \
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

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Gender Equality Analyst" — a Copilot agent specialized for gender equality data queries. Deploy it alongside the connector to provide guided discovery.
