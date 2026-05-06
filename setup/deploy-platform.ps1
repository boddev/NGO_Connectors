<#
.SYNOPSIS
  Idempotent deployment script for the Copilot Connector Hosting Platform.

.DESCRIPTION
  Provisions Azure infrastructure (Resource Group, Cosmos DB serverless,
  Container Registry, Container Apps Environment, Container App) on first run
  and updates the platform's container image on subsequent runs.

  The script detects existing infrastructure via `az ... show` and only
  creates resources that are missing. Cosmos DB is always provisioned in
  serverless mode (no minimum throughput cost).

  After a successful deploy, the resolved PLATFORM_URL plus the registry
  shared secret are written to `setup/.env` so subsequent connector
  deployments propagate them as app settings — connectors will then auto-
  register via the platform's `/api/registry/heartbeat` endpoint.

.PARAMETER EnvFile
  Path to a .env file with deployment configuration. Defaults to
  `platform/.env` if it exists.

.PARAMETER SkipInfra
  Skip the infrastructure detection / creation phase. Useful when you only
  want to redeploy code.

.PARAMETER SkipBuild
  Skip the npm build + image rebuild step.

.PARAMETER PlanOnly
  Print the deployment plan and exit without creating anything.

.PARAMETER NonInteractive
  Fail instead of prompting when required values are missing.

.EXAMPLE
  ./deploy-platform.ps1

.EXAMPLE
  ./deploy-platform.ps1 -SkipInfra -SkipBuild   # app settings refresh only
#>

[CmdletBinding()]
param(
  [string]$EnvFile = "",
  [string]$ResourceGroupName = "",
  [string]$Location = "",
  [string]$AzureSubscriptionId = "",
  [string]$AzureTenantId = "",
  [string]$PlatformAppName = "",
  [string]$CosmosAccountName = "",
  [string]$CosmosDatabaseName = "",
  [string]$ContainerRegistryName = "",
  [string]$ContainerAppEnvironmentName = "",
  [string]$ContainerCpu = "",
  [string]$ContainerMemory = "",
  [string]$ImageTag = "",
  [string]$AuthTenantId = "",
  [string]$AuthClientId = "",
  [string]$RegistrySharedSecret = "",
  [switch]$AuthBypass,
  [switch]$SkipInfra,
  [switch]$SkipBuild,
  [switch]$SkipDeploy,
  [switch]$PlanOnly,
  [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$env:AZURE_CORE_NO_PROMPT = "true"
$env:AZURE_EXTENSION_USE_DYNAMIC_INSTALL = "yes_without_prompt"

# ── Logging helpers ─────────────────────────────────────────────────────────
function Write-Step {
  param([string]$Step, [string]$Message)
  Write-Host ""
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
  Write-Host "  [$Step] $Message" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
}
function Write-Info { param([string]$Msg) Write-Host "  ℹ $Msg" -ForegroundColor Gray }
function Write-Ok   { param([string]$Msg) Write-Host "  OK $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "  WARN $Msg" -ForegroundColor Yellow }
function Test-Command { param([string]$Name) return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

function Invoke-AzCmd {
  param([string[]]$Arguments, [switch]$AllowFailure)
  $result = & az @Arguments 2>&1
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
    throw "Azure CLI command failed: az $($Arguments -join ' ')`n$($result -join "`n")"
  }
  return ($result | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n"
}

function Invoke-AzJson {
  param([string[]]$Arguments, [switch]$AllowFailure)
  $raw = Invoke-AzCmd -Arguments $Arguments -AllowFailure:$AllowFailure
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  try { return $raw | ConvertFrom-Json } catch { return $null }
}

function Test-AzResource {
  param([string[]]$ShowArguments)
  $null = Invoke-AzCmd -Arguments $ShowArguments -AllowFailure
  return ($LASTEXITCODE -eq 0)
}

function Read-EnvFile {
  param([string]$Path)
  $vars = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $vars }
  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $eq = $trimmed.IndexOf("=")
    if ($eq -le 0) { continue }
    $vars[$trimmed.Substring(0, $eq).Trim()] = $trimmed.Substring($eq + 1).Trim().Trim('"').Trim("'")
  }
  return $vars
}

function Get-ConfigValue {
  param([hashtable]$EnvVars, [string[]]$Keys, [string]$Current, [string]$Default = "")
  if (-not [string]::IsNullOrWhiteSpace($Current)) { return $Current }
  foreach ($key in $Keys) {
    if ($EnvVars.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($EnvVars[$key])) { return $EnvVars[$key] }
    $procValue = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($procValue)) { return $procValue }
  }
  return $Default
}

function Prompt-Value {
  param([string]$Label, [string]$Default = "", [switch]$Required)
  if ($NonInteractive) {
    if ($Required -and [string]::IsNullOrWhiteSpace($Default)) {
      throw "Required value missing in non-interactive mode: $Label"
    }
    return $Default
  }
  $suffix = if ([string]::IsNullOrWhiteSpace($Default)) { "" } else { " [$Default]" }
  $value = Read-Host "  -> $Label$suffix"
  if ([string]::IsNullOrWhiteSpace($value)) { $value = $Default }
  if ($Required -and [string]::IsNullOrWhiteSpace($value)) {
    throw "Required value not provided: $Label"
  }
  return $value
}

function Set-EnvFileKey {
  param([string]$Path, [string]$Key, [string]$Value)
  $lines = @()
  $found = $false
  if (Test-Path -LiteralPath $Path) {
    foreach ($line in Get-Content -LiteralPath $Path) {
      if ($line -match "^\s*$([regex]::Escape($Key))\s*=") {
        $lines += "$Key=$Value"
        $found = $true
      } else {
        $lines += $line
      }
    }
  }
  if (-not $found) { $lines += "$Key=$Value" }
  $lines | Set-Content -LiteralPath $Path -Encoding UTF8
}

# ── Prerequisite checks ─────────────────────────────────────────────────────
Write-Step "0/8" "Checking prerequisites"
foreach ($cmd in @("az", "node", "npm")) {
  if (-not (Test-Command $cmd)) { throw "Required command not found in PATH: $cmd" }
  Write-Ok "Found $cmd"
}

# ── Load configuration ─────────────────────────────────────────────────────
Write-Step "1/8" "Loading configuration"

$platformRoot = Join-Path (Split-Path -Parent $PSScriptRoot) "platform"
$repoRoot = Split-Path -Parent $PSScriptRoot
$setupEnvPath = Join-Path $PSScriptRoot ".env"

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $candidate = Join-Path $platformRoot ".env"
  if (Test-Path -LiteralPath $candidate) { $EnvFile = $candidate }
}
$envVars = if ([string]::IsNullOrWhiteSpace($EnvFile)) { @{} } else { Read-EnvFile -Path $EnvFile }
if (-not [string]::IsNullOrWhiteSpace($EnvFile)) { Write-Info "Loaded env from: $EnvFile" }

# Also pull defaults from setup/.env so the platform deploy can reuse the same
# subscription / region / ACR as the connectors.
$setupEnvVars = Read-EnvFile -Path $setupEnvPath
foreach ($k in $setupEnvVars.Keys) {
  if (-not $envVars.ContainsKey($k)) { $envVars[$k] = $setupEnvVars[$k] }
}

$AzureSubscriptionId = Get-ConfigValue $envVars @("AZURE_SUBSCRIPTION_ID") $AzureSubscriptionId ""
$AzureTenantId       = Get-ConfigValue $envVars @("AZURE_TENANT_ID","AZURE_DEPLOYMENT_TENANT_ID") $AzureTenantId ""
$Location            = Get-ConfigValue $envVars @("AZURE_LOCATION") $Location "eastus"
$ResourceGroupName   = Get-ConfigValue $envVars @("PLATFORM_RESOURCE_GROUP","AZURE_RESOURCE_GROUP") $ResourceGroupName "rg-ngo-connector-platform"
$PlatformAppName     = Get-ConfigValue $envVars @("PLATFORM_APP_NAME") $PlatformAppName "ngo-connector-platform"
$CosmosAccountName   = Get-ConfigValue $envVars @("PLATFORM_COSMOS_ACCOUNT") $CosmosAccountName ""
$CosmosDatabaseName  = Get-ConfigValue $envVars @("PLATFORM_COSMOS_DATABASE","COSMOS_DATABASE") $CosmosDatabaseName "connector-platform"
$ContainerRegistryName = Get-ConfigValue $envVars @("PLATFORM_CONTAINER_REGISTRY","AZURE_CONTAINER_REGISTRY") $ContainerRegistryName ""
$ContainerAppEnvironmentName = Get-ConfigValue $envVars @("PLATFORM_CONTAINER_APP_ENV","AZURE_CONTAINER_APP_ENV") $ContainerAppEnvironmentName "cae-ngo-connector-platform"
$ContainerCpu        = Get-ConfigValue $envVars @("PLATFORM_CONTAINER_CPU","CONTAINER_CPU") $ContainerCpu "0.5"
$ContainerMemory     = Get-ConfigValue $envVars @("PLATFORM_CONTAINER_MEMORY","CONTAINER_MEMORY") $ContainerMemory "1.0Gi"
$ImageTag            = Get-ConfigValue $envVars @("PLATFORM_IMAGE_TAG") $ImageTag (Get-Date -Format "yyyyMMddHHmmss")
$AuthTenantId        = Get-ConfigValue $envVars @("AUTH_TENANT_ID") $AuthTenantId ""
$AuthClientId        = Get-ConfigValue $envVars @("AUTH_CLIENT_ID") $AuthClientId ""
$RegistrySharedSecret = Get-ConfigValue $envVars @("REGISTRY_SHARED_SECRET") $RegistrySharedSecret ""
$envAuthBypass = Get-ConfigValue $envVars @("AUTH_BYPASS") "" ""
if (-not $AuthBypass.IsPresent -and $envAuthBypass) {
  if ($envAuthBypass.ToLower() -eq "true") { $AuthBypass = [switch]::Present }
}

# Auto-default AUTH_BYPASS=true when no Entra config provided so first deploy works.
$useAuthBypass = $AuthBypass.IsPresent -or [string]::IsNullOrWhiteSpace($AuthClientId)

# Prompt for required values if missing.
if ([string]::IsNullOrWhiteSpace($AzureSubscriptionId)) {
  $AzureSubscriptionId = Prompt-Value "Azure Subscription ID" "" -Required
}
if ([string]::IsNullOrWhiteSpace($AzureTenantId)) {
  $AzureTenantId = Prompt-Value "Azure Tenant ID (deployment)" ""
}

# Cosmos account names must be globally unique and 3-44 lowercase chars.
if ([string]::IsNullOrWhiteSpace($CosmosAccountName)) {
  $hash = [Math]::Abs(($PlatformAppName + $AzureSubscriptionId).GetHashCode()).ToString().Substring(0, 6)
  $CosmosAccountName = "cosmos-$PlatformAppName-$hash".ToLower()
  if ($CosmosAccountName.Length -gt 44) { $CosmosAccountName = $CosmosAccountName.Substring(0, 44) }
}
$CosmosAccountName = $CosmosAccountName.ToLower()

# ACR names must be 5-50 alphanumeric chars (no dashes).
if ([string]::IsNullOrWhiteSpace($ContainerRegistryName)) {
  $hash = [Math]::Abs(($PlatformAppName + $AzureSubscriptionId).GetHashCode()).ToString().Substring(0, 6)
  $ContainerRegistryName = ("acr" + ($PlatformAppName -replace "[^a-zA-Z0-9]", "") + $hash).ToLower()
  if ($ContainerRegistryName.Length -gt 50) {
    $ContainerRegistryName = $ContainerRegistryName.Substring(0, 50)
  }
}

# Generate a registry shared secret on first run.
if ([string]::IsNullOrWhiteSpace($RegistrySharedSecret)) {
  $RegistrySharedSecret = [Guid]::NewGuid().ToString("N")
  Write-Info "Generated REGISTRY_SHARED_SECRET (will be persisted for connector deploys)"
}

Write-Info "Subscription:    $AzureSubscriptionId"
Write-Info "Resource group:  $ResourceGroupName"
Write-Info "Location:        $Location"
Write-Info "App name:        $PlatformAppName"
Write-Info "Cosmos account:  $CosmosAccountName (serverless)"
Write-Info "Cosmos database: $CosmosDatabaseName"
Write-Info "ACR:             $ContainerRegistryName"
Write-Info "Cont. App env:   $ContainerAppEnvironmentName"
Write-Info "Image tag:       $ImageTag"
Write-Info "Auth bypass:     $useAuthBypass"

if ($PlanOnly) {
  Write-Step "PLAN" "Plan-only mode — exiting without changes"
  return
}

# ── Azure login + subscription scope ───────────────────────────────────────
Write-Step "2/8" "Verifying Azure login"
$account = Invoke-AzJson -Arguments @("account","show") -AllowFailure
if (-not $account) {
  if ($NonInteractive) { throw "Not logged in to Azure CLI. Run 'az login' first." }
  Invoke-AzCmd -Arguments @("login") | Out-Null
}
Invoke-AzCmd -Arguments @("account","set","--subscription",$AzureSubscriptionId) | Out-Null
Write-Ok "Subscription scoped to $AzureSubscriptionId"

# Required providers
foreach ($ns in @("Microsoft.DocumentDB","Microsoft.App","Microsoft.OperationalInsights","Microsoft.ContainerRegistry")) {
  Invoke-AzCmd -Arguments @("provider","register","--namespace",$ns) -AllowFailure | Out-Null
}

# ── Detect existing resources ──────────────────────────────────────────────
Write-Step "3/8" "Detecting existing infrastructure"
$rgExists = Test-AzResource -ShowArguments @("group","show","--name",$ResourceGroupName)
$cosmosExists = $false
$dbExists = $false
$acrExists = $false
$envExists = $false
$appExists = $false

if ($rgExists) {
  Write-Ok "Resource group exists: $ResourceGroupName"
  $cosmosExists = Test-AzResource -ShowArguments @("cosmosdb","show","--name",$CosmosAccountName,"--resource-group",$ResourceGroupName)
  if ($cosmosExists) {
    Write-Ok "Cosmos account exists: $CosmosAccountName"
    $dbExists = Test-AzResource -ShowArguments @("cosmosdb","sql","database","show","--account-name",$CosmosAccountName,"--name",$CosmosDatabaseName,"--resource-group",$ResourceGroupName)
  } else { Write-Info "Cosmos account missing — will create" }
  $acrExists = Test-AzResource -ShowArguments @("acr","show","--name",$ContainerRegistryName,"--resource-group",$ResourceGroupName)
  if (-not $acrExists) { Write-Info "ACR missing — will create" } else { Write-Ok "ACR exists: $ContainerRegistryName" }
  $envExists = Test-AzResource -ShowArguments @("containerapp","env","show","--name",$ContainerAppEnvironmentName,"--resource-group",$ResourceGroupName)
  if (-not $envExists) {
    # Subscriptions are limited to 1 Container Apps Environment by default.
    # Scan the whole subscription and reuse an existing one if present.
    $existingEnvs = Invoke-AzJson -Arguments @("containerapp","env","list") -AllowFailure
    if ($existingEnvs -and $existingEnvs.Count -gt 0) {
      $reuseEnv = $existingEnvs[0]
      $script:ContainerAppEnvironmentResourceId = $reuseEnv.id
      $script:ContainerAppEnvironmentName = $reuseEnv.name
      $script:ContainerAppEnvironmentLocation = $reuseEnv.location
      $envExists = $true
      Write-Ok "Reusing existing Container Apps env: $($reuseEnv.name) in $($reuseEnv.location) (resource group: $($reuseEnv.resourceGroup))"
    } else {
      Write-Info "Container Apps env missing — will create"
    }
  } else {
    Write-Ok "Container Apps env exists"
    $envInfo = Invoke-AzJson -Arguments @("containerapp","env","show","--name",$ContainerAppEnvironmentName,"--resource-group",$ResourceGroupName) -AllowFailure
    if ($envInfo) {
      $script:ContainerAppEnvironmentResourceId = $envInfo.id
      $script:ContainerAppEnvironmentLocation = $envInfo.location
    }
  }
  $appExists = Test-AzResource -ShowArguments @("containerapp","show","--name",$PlatformAppName,"--resource-group",$ResourceGroupName)
  if (-not $appExists) { Write-Info "Container App missing — will create" } else { Write-Ok "Container App exists" }
} else {
  Write-Info "Resource group missing — will create"
}

# ── Infrastructure phase ──────────────────────────────────────────────────
if (-not $SkipInfra) {
  Write-Step "4/8" "Provisioning infrastructure (idempotent)"

  if (-not $rgExists) {
    Invoke-AzCmd -Arguments @("group","create","--name",$ResourceGroupName,"--location",$Location) | Out-Null
    Write-Ok "Created resource group $ResourceGroupName"
  }

  if (-not $cosmosExists) {
    Write-Info "Creating Cosmos DB account in serverless mode (this can take 5+ minutes)..."
    Invoke-AzCmd -Arguments @(
      "cosmosdb","create",
      "--name",$CosmosAccountName,
      "--resource-group",$ResourceGroupName,
      "--locations","regionName=$Location","failoverPriority=0","isZoneRedundant=False",
      "--capabilities","EnableServerless",
      "--default-consistency-level","Session"
    ) | Out-Null
    Write-Ok "Created Cosmos serverless account: $CosmosAccountName"
  }

  if (-not $dbExists) {
    Invoke-AzCmd -Arguments @(
      "cosmosdb","sql","database","create",
      "--account-name",$CosmosAccountName,
      "--resource-group",$ResourceGroupName,
      "--name",$CosmosDatabaseName
    ) | Out-Null
    Write-Ok "Created Cosmos database: $CosmosDatabaseName"
  }

  # Create containers with the partition keys cosmosService.ts expects.
  # NOTE: tenants partition by /id (no tenantId field on Tenant docs).
  $containers = @(
    @{ name = "tenants";        partition = "/id" },
    @{ name = "connectors";     partition = "/tenantId" },
    @{ name = "uploads";        partition = "/tenantId" },
    @{ name = "jobs";           partition = "/tenantId" },
    @{ name = "alerts";         partition = "/tenantId" },
    @{ name = "schemaVersions"; partition = "/tenantId" }
  )
  foreach ($c in $containers) {
    $exists = Test-AzResource -ShowArguments @(
      "cosmosdb","sql","container","show",
      "--account-name",$CosmosAccountName,
      "--resource-group",$ResourceGroupName,
      "--database-name",$CosmosDatabaseName,
      "--name",$c.name
    )
    if (-not $exists) {
      # Serverless containers MUST be created without --throughput.
      Invoke-AzCmd -Arguments @(
        "cosmosdb","sql","container","create",
        "--account-name",$CosmosAccountName,
        "--resource-group",$ResourceGroupName,
        "--database-name",$CosmosDatabaseName,
        "--name",$c.name,
        "--partition-key-path",$c.partition
      ) | Out-Null
      Write-Ok "Created container: $($c.name) (partition=$($c.partition))"
    } else {
      Write-Info "Container already exists: $($c.name)"
    }
  }

  if (-not $acrExists) {
    Invoke-AzCmd -Arguments @(
      "acr","create",
      "--name",$ContainerRegistryName,
      "--resource-group",$ResourceGroupName,
      "--sku","Basic",
      "--location",$Location
    ) | Out-Null
    Write-Ok "Created ACR: $ContainerRegistryName"
  }

  if (-not $envExists) {
    Invoke-AzCmd -Arguments @(
      "containerapp","env","create",
      "--name",$ContainerAppEnvironmentName,
      "--resource-group",$ResourceGroupName,
      "--location",$Location
    ) | Out-Null
    Write-Ok "Created Container Apps environment"
    $envInfo = Invoke-AzJson -Arguments @(
      "containerapp","env","show",
      "--name",$ContainerAppEnvironmentName,
      "--resource-group",$ResourceGroupName
    )
    $script:ContainerAppEnvironmentResourceId = $envInfo.id
    $script:ContainerAppEnvironmentLocation = $envInfo.location
  }
} else {
  Write-Step "4/8" "Skipping infrastructure (-SkipInfra)"
}

# ── Build + push image ────────────────────────────────────────────────────
$acrLoginServer = "$ContainerRegistryName.azurecr.io"
$imageName = "${acrLoginServer}/connector-platform:$ImageTag"

if (-not $SkipBuild) {
  Write-Step "5/8" "Building platform image via ACR build"

  Push-Location $platformRoot
  try {
    Invoke-AzCmd -Arguments @(
      "acr","build",
      "--registry",$ContainerRegistryName,
      "--resource-group",$ResourceGroupName,
      "--image","connector-platform:$ImageTag",
      "--image","connector-platform:latest",
      "--file","Dockerfile",
      "."
    ) | Out-Null
    Write-Ok "Built and pushed: $imageName"
  } finally { Pop-Location }
} else {
  Write-Step "5/8" "Skipping build (-SkipBuild)"
}

# ── Resolve Cosmos credentials ────────────────────────────────────────────
Write-Step "6/8" "Resolving runtime configuration"
$cosmosEndpoint = (Invoke-AzJson -Arguments @(
  "cosmosdb","show",
  "--name",$CosmosAccountName,
  "--resource-group",$ResourceGroupName
)).documentEndpoint
$cosmosKeysJson = Invoke-AzJson -Arguments @(
  "cosmosdb","keys","list",
  "--name",$CosmosAccountName,
  "--resource-group",$ResourceGroupName
)
$cosmosKey = $cosmosKeysJson.primaryMasterKey
Write-Ok "Cosmos endpoint: $cosmosEndpoint"

$envVarsList = @(
  "PORT=3001",
  "COSMOS_ENDPOINT=$cosmosEndpoint",
  "COSMOS_KEY=$cosmosKey",
  "COSMOS_DATABASE=$CosmosDatabaseName",
  "REGISTRY_SHARED_SECRET=$RegistrySharedSecret"
)
if ($useAuthBypass) {
  $envVarsList += "AUTH_BYPASS=true"
} else {
  $envVarsList += "AUTH_BYPASS=false"
  if ($AuthTenantId) { $envVarsList += "AUTH_TENANT_ID=$AuthTenantId" }
  if ($AuthClientId) { $envVarsList += "AUTH_CLIENT_ID=$AuthClientId" }
}

# ── Deploy / update Container App ─────────────────────────────────────────
if (-not $SkipDeploy) {
  if (-not $appExists) {
    Write-Step "7/8" "Creating Container App with managed identity for ACR pull"

    # Step 1: create with system-assigned identity, no image yet (use a placeholder
    # by passing a public image; ACR pull is wired up after the identity exists).
    # Pass the environment as a full resource ID so cross-RG reuse works.
    $envRef = if ($script:ContainerAppEnvironmentResourceId) {
      $script:ContainerAppEnvironmentResourceId
    } else {
      $ContainerAppEnvironmentName
    }
    Invoke-AzCmd -Arguments @(
      "containerapp","create",
      "--name",$PlatformAppName,
      "--resource-group",$ResourceGroupName,
      "--environment",$envRef,
      "--image","mcr.microsoft.com/azuredocs/aci-helloworld:latest",
      "--target-port","3001",
      "--ingress","external",
      "--cpu",$ContainerCpu,
      "--memory",$ContainerMemory,
      "--min-replicas","1",
      "--max-replicas","3",
      "--system-assigned"
    ) | Out-Null
    Write-Ok "Created Container App (placeholder image)"

    $principalId = (Invoke-AzJson -Arguments @(
      "containerapp","show",
      "--name",$PlatformAppName,
      "--resource-group",$ResourceGroupName
    )).identity.principalId
    $acrId = (Invoke-AzJson -Arguments @(
      "acr","show",
      "--name",$ContainerRegistryName,
      "--resource-group",$ResourceGroupName
    )).id
    Invoke-AzCmd -Arguments @(
      "role","assignment","create",
      "--role","AcrPull",
      "--assignee-object-id",$principalId,
      "--assignee-principal-type","ServicePrincipal",
      "--scope",$acrId
    ) -AllowFailure | Out-Null
    Write-Ok "Granted AcrPull on $ContainerRegistryName to managed identity"

    Invoke-AzCmd -Arguments @(
      "containerapp","registry","set",
      "--name",$PlatformAppName,
      "--resource-group",$ResourceGroupName,
      "--server",$acrLoginServer,
      "--identity","system"
    ) | Out-Null
  } else {
    Write-Step "7/8" "Updating existing Container App"
  }

  # Update image + env vars (always — works for both create and update flows).
  # Using --replace-env-vars so the deploy is fully declarative: re-running with
  # the same config produces the same env state, and env vars never get
  # accidentally wiped by an --image-only update on subsequent revisions.
  $envArgs = @()
  foreach ($pair in $envVarsList) { $envArgs += "--replace-env-vars"; $envArgs += $pair }

  Invoke-AzCmd -Arguments (@(
    "containerapp","update",
    "--name",$PlatformAppName,
    "--resource-group",$ResourceGroupName,
    "--image",$imageName
  ) + $envArgs) | Out-Null
  Write-Ok "Updated Container App to image $imageName with platform env vars"
} else {
  Write-Step "7/8" "Skipping deploy (-SkipDeploy)"
}

# ── Resolve URL + persist for connector deploys ───────────────────────────
Write-Step "8/8" "Persisting PLATFORM_URL for connector deploys"
$fqdn = (Invoke-AzJson -Arguments @(
  "containerapp","show",
  "--name",$PlatformAppName,
  "--resource-group",$ResourceGroupName
)).properties.configuration.ingress.fqdn

if ([string]::IsNullOrWhiteSpace($fqdn)) {
  Write-Warn "Could not resolve Container App FQDN — check ingress configuration"
} else {
  $platformUrl = "https://$fqdn"
  Write-Ok "Platform URL: $platformUrl"

  # Persist into setup/.env so deploy-connectors.ps1 propagates to all 16 connectors.
  if (-not (Test-Path -LiteralPath $setupEnvPath)) {
    Write-Info "Creating $setupEnvPath"
    New-Item -ItemType File -Path $setupEnvPath -Force | Out-Null
  }
  Set-EnvFileKey -Path $setupEnvPath -Key "PLATFORM_URL" -Value $platformUrl
  Set-EnvFileKey -Path $setupEnvPath -Key "PLATFORM_TENANT_ID" -Value "internal"
  Set-EnvFileKey -Path $setupEnvPath -Key "REGISTRY_SHARED_SECRET" -Value $RegistrySharedSecret
  Write-Ok "Wrote PLATFORM_URL, PLATFORM_TENANT_ID, REGISTRY_SHARED_SECRET to $setupEnvPath"

  # Also persist to platform/.env for local reference / re-runs.
  $platformEnvPath = Join-Path $platformRoot ".env"
  if (-not (Test-Path -LiteralPath $platformEnvPath)) {
    New-Item -ItemType File -Path $platformEnvPath -Force | Out-Null
  }
  Set-EnvFileKey -Path $platformEnvPath -Key "PLATFORM_URL" -Value $platformUrl
  Set-EnvFileKey -Path $platformEnvPath -Key "REGISTRY_SHARED_SECRET" -Value $RegistrySharedSecret
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Platform deployment complete" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "  Next step: redeploy the connectors so they pick up PLATFORM_URL:" -ForegroundColor Yellow
Write-Host "    pwsh setup/deploy-connectors.ps1 -SetAppSettings" -ForegroundColor White
Write-Host ""
