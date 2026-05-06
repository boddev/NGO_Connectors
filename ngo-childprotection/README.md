# NGO Child Protection & Welfare — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available child protection and welfare data from the World Bank and Our World in Data into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Child Indicators | REST API | ~30,000+ | None |
| Our World in Data (Child Mortality/Labor/Stunting) | GitHub CSV | ~10,000+ | None |

### World Bank Indicators

| Code | Indicator | Domain |
|------|-----------|--------|
| `SH.DYN.MORT` | Under-5 mortality rate (per 1,000 live births) | Health |
| `SP.DYN.IMRT.IN` | Infant mortality rate (per 1,000 live births) | Health |
| `SL.TLF.0714.ZS` | Children in employment, ages 7-14 (%) | Labour |
| `SE.PRM.CMPT.ZS` | Primary completion rate (%) | Health |
| `SP.REG.BRTH.ZS` | Completeness of birth registration (%) | Registration |
| `SH.STA.STNT.ZS` | Prevalence of stunting (% of children under 5) | Health |

### OWID Datasets

- Under-5 mortality rate
- Youth mortality rates (UN IGME 2021) — under-five, infant, neonatal
- Child labor incidence (ILO global estimates)
- Number of stunted children (UNICEF/WHO)
- Child mortality estimates (CME Info)

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
docker build -t ngo-childprotection-connector .
az containerapp up --name ngo-childprotection \
  --resource-group ngo-connectors-rg \
  --image ngo-childprotection-connector \
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
| `fullCrawl` | Monthly (1st, 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Weekly (Monday 6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Schema — Child Protection Properties

| Property | Type | Purpose |
|----------|------|---------|
| `childProtectionIssue` | String | Child Mortality, Child Labor, Birth Registration, etc. |
| `ageRange` | String | Under 1, Under 5, 5-14, 7-14, Under 18 |
| `prevalenceRate` | Double | Percentage or rate of children affected |
| `legalProtection` | Boolean | Whether the country has legal protections for this issue |
| `childWelfareDomain` | String | Health, Labour, Registration |

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Child Welfare Analyst" — a Copilot agent specialized for child protection data queries. Deploy it alongside the connector to provide guided discovery.
