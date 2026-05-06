# NGO Connectors Interactive Deployment

The root deployment scripts support Azure Functions and Azure Functions on Azure Container Apps.

## Quick start

1. Copy the template:

```powershell
Copy-Item .\setup\.env.template .\setup\.env
```

2. Edit `setup\.env` with your Azure deployment tenant/subscription, Microsoft 365 tenant, app registration, and naming values.

3. Deploy one connector interactively:

```powershell
.\ngo-healthcare\deploy.ps1
```

4. Deploy all connectors interactively:

```powershell
.\deploy-connectors.ps1
```

## Container Apps deployment

Set `DEPLOY_TARGET=container-app` or pass `-DeployTarget container-app`. The scripts create or reuse:

- Resource group
- Storage account
- Azure Container Registry
- Container Apps Environment
- Azure Function App hosted on Container Apps

Each connector image is built with `az acr build` from that connector's `Dockerfile`, then assigned to the Function App.

## Azure Functions deployment

Set `DEPLOY_TARGET=azure-functions` or pass `-DeployTarget azure-functions`. The scripts create or reuse:

- Resource group
- Storage account
- Linux App Service Plan
- Azure Function App

The connector is published with Azure Functions Core Tools.

## Azure deployment tenant and subscription

The deployment tenant is intentionally separate from the Microsoft 365 tenant used by the Graph connector runtime.

Set or provide these values when deploying:

- `AZURE_TENANT_ID` — Azure tenant to log into for resource deployment.
- `AZURE_SUBSCRIPTION_ID` — Azure subscription ID or name where resources are created.
- `MICROSOFT_TENANT_ID` — Microsoft 365 tenant used by the Graph connector app registration and runtime auth. This can be the same as `AZURE_TENANT_ID`, but it is prompted separately.

## Common examples

Plan without making Azure changes:

```powershell
.\deploy-connectors.ps1 -PlanOnly
```

Deploy all connectors from `setup\.env` and configure app settings:

```powershell
.\deploy-connectors.ps1 -EnvFile .\setup\.env -SetAppSettings
```

Deploy one connector to Container Apps and provision the Graph connection:

```powershell
.\ngo-environment\deploy.ps1 -EnvFile .\setup\.env -DeployTarget container-app -Provision
```

Interactive deployments prompt whether to provision the Microsoft Graph connector after the Azure app is deployed. The deployment sequence is:

1. Deploy Azure infrastructure and application hosting.
2. Provision the Microsoft Graph external connection directly from PowerShell by creating or reusing the connection, registering the schema, and waiting for schema registration to complete.
3. Trigger the initial full crawl against the deployed connector app.

The hosted `/api/provision` endpoint still exists for manual recovery, but the deployment script no longer depends on it. If provisioning is skipped, Azure deployment still succeeds, but no connector appears in the Microsoft 365 admin portal until Graph provisioning runs or `/api/provision` is invoked manually.

Deploy all connectors and trigger initial crawls:

```powershell
.\deploy-connectors.ps1 -EnvFile .\setup\.env -SetAppSettings -Provision -Crawl
```

## Entra ID app registration

For production, create or provide an Entra ID app registration with:

- `ExternalConnection.ReadWrite.OwnedBy`
- `ExternalItem.ReadWrite.OwnedBy`

Then set:

- `MICROSOFT_TENANT_ID`
- `AZURE_CLIENT_ID`
- `SECRET_AZURE_CLIENT_SECRET`

For development, when no `AZURE_CLIENT_ID` is supplied, the script automatically reuses an app registration with the connector display name or creates one if none exists. It always creates a new client secret for reused or newly-created app registrations because existing secret values cannot be retrieved. When permissions are added, the script attempts admin consent with the signed-in account and warns if the account cannot grant consent.

## Existing resources

The deployment scripts create missing Azure resources automatically. In interactive mode, if a named resource already exists, the script asks before reusing it. Enter new names when you want new resources, or confirm reuse when you want an existing resource group, storage account, Container Registry, Container Apps environment, App Service Plan, or Function App.

For Container Apps deployments, the scripts also check the selected subscription for existing Container Apps Environments before creating one. If one exists, the script asks whether to reuse it and uses that environment's resource group and location. This avoids failures in subscriptions that are limited to one Container Apps Environment.
