# NGO Agriculture & Food Security — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available agriculture and food security data from the World Bank, Our World in Data, and FAOSTAT into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Agriculture Indicators | REST API | ~30,000+ | None |
| Our World in Data (Food/Agriculture) | GitHub CSV | ~15,000+ | None |
| FAOSTAT Crop Production | REST API | ~1,000+ | None |

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
docker build -t ngo-agriculture-connector .
az containerapp up --name ngo-agriculture \
  --resource-group ngo-connectors-rg \
  --image ngo-agriculture-connector \
  --env-vars TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
```

## Project Structure

```
src/
├── config/          # Connection metadata and schema definition
├── dataSources/     # Data acquisition from World Bank, OWID, FAOSTAT
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

## Schema — Agriculture-Specific Properties

| Property | Type | Purpose |
|----------|------|---------|
| `cropOrCommodity` | String | Crop, livestock, or commodity name (e.g., "Wheat", "Rice") |
| `foodSecurityPhase` | String | IPC/CH phase classification (1-5: Minimal to Famine) |
| `productionVolume` | Double | Production quantity in tonnes |
| `tradeFlow` | String | Import, Export, or Net trade |
| `agriculturalDomain` | String | Production, Trade, Food Security, Water Resources |

## Data Sources Details

### World Bank Indicators
- `AG.PRD.FOOD.XD` — Food production index
- `AG.YLD.CREL.KG` — Cereal yield (kg/ha)
- `AG.LND.ARBL.ZS` — Arable land (% of land area)
- `AG.LND.AGRI.ZS` — Agricultural land (% of land area)
- `AG.PRD.CREL.MT` — Cereal production (metric tons)
- `AG.PRD.LVSK.XD` — Livestock production index
- `NV.AGR.TOTL.ZS` — Agriculture value added (% of GDP)
- `SN.ITK.DEFC.ZS` — Prevalence of undernourishment
- `SH.STA.STNT.ZS` — Stunting in children under 5
- `AG.LND.FRST.ZS` — Forest area (% of land area)
- `ER.H2O.FWTL.ZS` — Freshwater withdrawals for agriculture

### OWID Datasets
- Food supply per capita (kcal/day, protein g/day, meat kg/year)
- Agricultural total factor productivity (USDA)
- Crop and animal output quantities
- Cereal allocation to food, feed, and fuel
- Global Hunger Index

### FAOSTAT (when available)
- Crop production volumes and yields for wheat, rice, maize, soybeans, barley
- Coverage: 12 major producing countries

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Food Security Analyst" — a Copilot agent specialized for agriculture and food security data queries. Deploy it alongside the connector to provide guided discovery.
