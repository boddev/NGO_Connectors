# NGO Energy & Infrastructure — Copilot Connector

A Microsoft 365 Copilot Connector that ingests publicly available energy and infrastructure data from the World Bank and Our World in Data into the Microsoft Graph semantic index.

## Data Sources

| Source | Type | Records | Auth |
|--------|------|---------|------|
| World Bank Energy Indicators | REST API | ~25,000+ | None |
| Our World in Data (Energy) | GitHub CSV | ~30,000+ | None |

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
docker build -t ngo-energy-connector .
az containerapp up --name ngo-energy \
  --resource-group ngo-connectors-rg \
  --image ngo-energy-connector \
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

## Schema — Energy-Specific Properties

| Property | Type | Purpose |
|----------|------|---------|
| `energySource` | String | Solar, Wind, Hydro, Fossil Fuel, Renewable, etc. |
| `accessRate` | Double | Electrification or clean cooking access percentage |
| `capacityMW` | Double | Installed capacity in megawatts |
| `infrastructureType` | String | Power Plant, Grid, Transmission Line, Substation, Mini-grid |
| `electrificationRate` | Double | Percentage of population with electricity access |

## Crawl Schedule

| Function | Schedule | Purpose |
|----------|----------|---------|
| `fullCrawl` | Monthly (1st, 2 AM UTC) | Complete re-ingestion from all sources |
| `incrementalCrawl` | Weekly (Mon, 6 AM UTC) | Check for new/updated data |
| `onDemandCrawl` | HTTP POST | Admin-triggered off-cycle refresh |

## Declarative Agent

The `declarativeAgent.json` file defines the "NGO Energy Access Analyst" — a Copilot agent specialized for energy data queries. Deploy it alongside the connector to provide guided discovery.

## World Bank Indicators

| Code | Indicator |
|------|-----------|
| `EG.ELC.ACCS.ZS` | Access to electricity (% of population) |
| `EG.FEC.RNEW.ZS` | Renewable energy consumption (% of total final energy) |
| `EG.USE.PCAP.KG.OE` | Energy use (kg of oil equivalent per capita) |
| `EG.USE.ELEC.KH.PC` | Electric power consumption (kWh per capita) |
| `EG.ELC.RNEW.ZS` | Renewable electricity output (% of total electricity) |

## OWID Energy Indicators

| Column | Indicator |
|--------|-----------|
| `electricity_generation` | Electricity generation (TWh) |
| `renewables_share_elec` | Renewables share of electricity (%) |
| `fossil_share_elec` | Fossil fuels share of electricity (%) |
| `energy_per_capita` | Primary energy consumption per capita (kWh) |
| `renewables_consumption` | Renewables consumption (TWh) |
| `fossil_fuel_consumption` | Fossil fuel consumption (TWh) |
| `primary_energy_consumption` | Primary energy consumption (TWh) |
