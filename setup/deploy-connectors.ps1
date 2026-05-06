<#
.SYNOPSIS
  Interactive deployment script for all NGO connectors.

.DESCRIPTION
  Prompts once for shared Azure deployment settings and then executes each
  connector's individual deploy.ps1 script. Supports Azure Functions and Azure
  Functions on Azure Container Apps.
#>

[CmdletBinding()]
param(
  [string]$EnvFile = "",
  [ValidateSet("azure-functions", "container-app")]
  [string]$DeployTarget = "",
  [string]$FunctionAppNamePrefix = $env:FUNCTION_APP_NAME_PREFIX,
  [string]$FunctionAppNameSuffix = $env:FUNCTION_APP_NAME_SUFFIX,
  [string]$ResourceGroupName = $env:AZURE_RESOURCE_GROUP,
  [string]$Location = $env:AZURE_LOCATION,
  [string]$StorageAccountName = $env:AZURE_STORAGE_ACCOUNT,
  [string]$AppServicePlanName = $env:AZURE_APP_SERVICE_PLAN,
  [string]$PlanSku = $env:AZURE_PLAN_SKU,
  [string]$ContainerRegistryName = $env:AZURE_CONTAINER_REGISTRY,
  [string]$ContainerAppEnvironmentName = $env:AZURE_CONTAINER_APP_ENV,
  [string]$ContainerCpu = $env:CONTAINER_CPU,
  [string]$ContainerMemory = $env:CONTAINER_MEMORY,
  [string]$AzureTenantId = $env:AZURE_TENANT_ID,
  [string]$AzureSubscriptionId = $env:AZURE_SUBSCRIPTION_ID,
  [string]$TenantId = $env:TENANT_ID,
  [string]$ClientId = $env:CLIENT_ID,
  [string]$ClientSecret = $env:CLIENT_SECRET,
  [string]$ConnectorStatePath = $env:CONNECTOR_STATE_PATH,
  [string]$PlatformUrl = $env:PLATFORM_URL,
  [string]$PlatformTenantId = $env:PLATFORM_TENANT_ID,
  [string]$RegistrySharedSecret = $env:REGISTRY_SHARED_SECRET,
  [string[]]$AdditionalAppSetting = @(),
  [switch]$SetAppSettings,
  [switch]$SkipRestore,
  [switch]$SkipBuild,
  [switch]$SkipPublish,
  [switch]$Provision,
  [switch]$Crawl,
  [switch]$BuildAgentPackages,
  [switch]$DeployAgentPackages,
  [string]$FunctionKey = $env:AZURE_FUNCTION_KEY,
  [switch]$NonInteractive,
  [switch]$AutoCreateEntraApp,
  [switch]$GrantAdminConsent,
  [switch]$PlanOnly,
  [string[]]$ConnectorName = @(
    "ngo-agriculture",
    "ngo-aidfunding",
    "ngo-childprotection",
    "ngo-conflict",
    "ngo-economics",
    "ngo-education",
    "ngo-energy",
    "ngo-environment",
    "ngo-gender",
    "ngo-healthcare",
    "ngo-humanitarian",
    "ngo-humanrights",
    "ngo-multisector",
    "ngo-nonprofit",
    "ngo-refugees",
    "ngo-wash"
  )
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$env:AZURE_CORE_NO_PROMPT = "true"
$env:AZURE_EXTENSION_USE_DYNAMIC_INSTALL = "yes_without_prompt"

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
  try { return $raw | ConvertFrom-Json } catch {
    $trimmed = $raw.Trim()
    $arrayStart = $trimmed.IndexOf("[")
    $objectStart = $trimmed.IndexOf("{")
    $starts = @($arrayStart, $objectStart) | Where-Object { $_ -ge 0 } | Sort-Object
    if ($starts.Count -gt 0) {
      $start = $starts[0]
      $endChar = if ($trimmed[$start] -eq "[") { "]" } else { "}" }
      $end = $trimmed.LastIndexOf($endChar)
      if ($end -gt $start) {
        try { return $trimmed.Substring($start, $end - $start + 1) | ConvertFrom-Json } catch { }
      }
    }
    return $raw
  }
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

function Get-EnvValue {
  param([hashtable]$Env, [string[]]$Keys, [string]$Current, [string]$Default = "")
  if (-not [string]::IsNullOrWhiteSpace($Current)) { return $Current }
  foreach ($key in $Keys) {
    if ($Env.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($Env[$key])) { return $Env[$key] }
    $processValue = [Environment]::GetEnvironmentVariable($key)
    if (-not [string]::IsNullOrWhiteSpace($processValue)) { return $processValue }
  }
  return $Default
}

function Prompt-Value {
  param([string]$Label, [string]$Default = "", [switch]$Required, [switch]$Secret)
  if ($NonInteractive) {
    if ($Required -and [string]::IsNullOrWhiteSpace($Default)) { throw "Required value missing: $Label" }
    return $Default
  }

  $suffix = if ([string]::IsNullOrWhiteSpace($Default) -or $Secret) { "" } else { " [$Default]" }
  if ($Secret) {
    $secure = Read-Host "  -> $Label" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  } else {
    $value = Read-Host "  -> $Label$suffix"
  }
  if ([string]::IsNullOrWhiteSpace($value)) { $value = $Default }
  if ($Required -and [string]::IsNullOrWhiteSpace($value)) { throw "Required value not provided: $Label" }
  return $value
}

function Normalize-AzureLocation {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return "eastus" }
  switch ($Value.Trim().ToLowerInvariant()) {
    "us-east" { return "eastus" }
    "east-us" { return "eastus" }
    default { return $Value.Trim().ToLowerInvariant() }
  }
}

function Get-AzureUsRegions {
  return @(
    [pscustomobject]@{ Name = "East US"; Value = "eastus" },
    [pscustomobject]@{ Name = "East US 2"; Value = "eastus2" },
    [pscustomobject]@{ Name = "Central US"; Value = "centralus" },
    [pscustomobject]@{ Name = "North Central US"; Value = "northcentralus" },
    [pscustomobject]@{ Name = "South Central US"; Value = "southcentralus" },
    [pscustomobject]@{ Name = "West Central US"; Value = "westcentralus" },
    [pscustomobject]@{ Name = "West US"; Value = "westus" },
    [pscustomobject]@{ Name = "West US 2"; Value = "westus2" },
    [pscustomobject]@{ Name = "West US 3"; Value = "westus3" }
  )
}

function Prompt-AzureUsRegion {
  param([string]$Default = "eastus")
  $normalizedDefault = Normalize-AzureLocation $Default
  if ($NonInteractive) { return $normalizedDefault }

  $regions = Get-AzureUsRegions
  $defaultIndex = 1
  for ($i = 0; $i -lt $regions.Count; $i++) {
    if ($regions[$i].Value -eq $normalizedDefault) {
      $defaultIndex = $i + 1
      break
    }
  }

  Write-Host "  Select Azure US region:" -ForegroundColor Gray
  for ($i = 0; $i -lt $regions.Count; $i++) {
    $region = $regions[$i]
    $marker = if (($i + 1) -eq $defaultIndex) { " (default)" } else { "" }
    Write-Host ("    {0}. {1} ({2}){3}" -f ($i + 1), $region.Name, $region.Value, $marker) -ForegroundColor Gray
  }

  $choice = Prompt-Value "Azure region number or location name" ([string]$defaultIndex) -Required
  $normalizedChoice = Normalize-AzureLocation $choice
  $choiceNumber = 0
  if ([int]::TryParse($choice, [ref]$choiceNumber)) {
    if ($choiceNumber -ge 1 -and $choiceNumber -le $regions.Count) {
      return $regions[$choiceNumber - 1].Value
    }
    throw "Invalid Azure region selection: $choice"
  }

  foreach ($region in $regions) {
    if ($region.Value -eq $normalizedChoice -or $region.Name.ToLowerInvariant() -eq $normalizedChoice) {
      return $region.Value
    }
  }
  throw "Invalid Azure US region: $choice"
}

function Get-ObjectStringProperty {
  param([object]$Object, [string]$Name)
  if ($null -eq $Object) { return "" }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property -or $null -eq $property.Value) { return "" }
  return [string]$property.Value
}

function Get-ResourceGroupFromResourceId {
  param([string]$ResourceId)
  if ([string]::IsNullOrWhiteSpace($ResourceId)) { return "" }
  if ($ResourceId -match '/resourceGroups/([^/]+)/') { return $Matches[1] }
  return ""
}

function Get-ContainerAppEnvironmentResourceGroup {
  param([object]$Environment)
  $resourceGroup = Get-ObjectStringProperty $Environment "resourceGroup"
  if (-not [string]::IsNullOrWhiteSpace($resourceGroup)) { return $resourceGroup }
  return Get-ResourceGroupFromResourceId (Get-ObjectStringProperty $Environment "id")
}

function Ensure-AzureSubscriptionContext {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw "Required tool 'az' not found on PATH." }
  if ([string]::IsNullOrWhiteSpace($AzureTenantId)) { throw "Azure tenant ID is required for deployment." }
  if ([string]::IsNullOrWhiteSpace($AzureSubscriptionId)) { throw "Azure subscription ID or name is required for deployment." }

  $account = Invoke-AzJson -Arguments @("account", "show") -AllowFailure
  if ($null -eq $account -or $LASTEXITCODE -ne 0 -or $account.tenantId -ne $AzureTenantId) {
    Write-Host "  Opening browser for Azure login to tenant $AzureTenantId..." -ForegroundColor Gray
    Invoke-AzCmd -Arguments @("login", "--tenant", $AzureTenantId) | Out-Null
  }

  Invoke-AzCmd -Arguments @("account", "set", "--subscription", $AzureSubscriptionId) | Out-Null
  $account = Invoke-AzJson -Arguments @("account", "show", "--subscription", $AzureSubscriptionId)
  if ($account.tenantId -ne $AzureTenantId) { throw "Azure CLI is set to tenant $($account.tenantId), expected $AzureTenantId." }
}

function Get-ContainerAppEnvironments {
  $environments = Invoke-AzJson -Arguments @("containerapp", "env", "list", "--subscription", $AzureSubscriptionId, "--query", "[].{name:name,resourceGroup:resourceGroup,location:location,id:id}", "--output", "json", "--only-show-errors") -AllowFailure
  if ($null -eq $environments -or $LASTEXITCODE -ne 0) { return @() }

  $environmentList = @($environments)
  $validEnvironments = @($environmentList | Where-Object { -not [string]::IsNullOrWhiteSpace((Get-ObjectStringProperty $_ "name")) })
  if ($validEnvironments.Count -lt $environmentList.Count) {
    Write-Host "  WARN Ignored $($environmentList.Count - $validEnvironments.Count) Container Apps Environment list item(s) because Azure CLI did not return a name." -ForegroundColor Yellow
  }
  return $validEnvironments
}

function Set-ContainerAppEnvironmentFromExisting {
  param([object]$Environment)

  $name = Get-ObjectStringProperty $Environment "name"
  $resourceGroup = Get-ContainerAppEnvironmentResourceGroup $Environment
  $location = Get-ObjectStringProperty $Environment "location"
  if ([string]::IsNullOrWhiteSpace($name)) { throw "Selected Container Apps Environment did not include a name." }

  $script:ContainerAppEnvironmentName = $name
  if (-not [string]::IsNullOrWhiteSpace($location)) {
    $script:Location = Normalize-AzureLocation $location
  }
  if (-not [string]::IsNullOrWhiteSpace($resourceGroup)) {
    $script:ResourceGroupName = $resourceGroup
  }

  $script:SelectedContainerAppEnvironmentFromSubscription = $true
  Write-Host "  OK Selected existing Container Apps environment: $name" -ForegroundColor Green
}

function Select-ContainerAppEnvironmentFromSubscription {
  if ($DeployTarget -ne "container-app") { return }

  Ensure-AzureSubscriptionContext
  $environments = @(Get-ContainerAppEnvironments)
  if ($environments.Count -eq 0) { return }

  if ($NonInteractive) {
    $first = $environments[0]
    $name = Get-ObjectStringProperty $first "name"
    Write-Host "  WARN Found an existing Container Apps environment in this subscription. Reusing '$name' because subscriptions may be limited to one Container Apps Environment." -ForegroundColor Yellow
    Set-ContainerAppEnvironmentFromExisting -Environment $first
    return
  }

  if ($environments.Count -eq 1) {
    $environment = $environments[0]
    $name = Get-ObjectStringProperty $environment "name"
    $resourceGroup = Get-ContainerAppEnvironmentResourceGroup $environment
    $location = Get-ObjectStringProperty $environment "location"
    $answer = Prompt-Value "Found existing Container Apps environment '$name' in resource group '$resourceGroup' ($location). Use it? (y/n)" "y"
    if ($answer -match '^(y|yes)$') {
      Set-ContainerAppEnvironmentFromExisting -Environment $environment
      return
    }

    throw "Existing Container Apps environment '$name' was declined. This subscription may be limited to one Container Apps Environment; re-run with another subscription or delete the existing environment."
  }

  Write-Host "  Existing Container Apps environments found in this subscription:" -ForegroundColor Gray
  for ($i = 0; $i -lt $environments.Count; $i++) {
    $environment = $environments[$i]
    $name = Get-ObjectStringProperty $environment "name"
    $resourceGroup = Get-ContainerAppEnvironmentResourceGroup $environment
    $location = Get-ObjectStringProperty $environment "location"
    Write-Host ("    {0}. {1} - {2} ({3})" -f ($i + 1), $name, $resourceGroup, $location) -ForegroundColor Gray
  }

  $choice = Prompt-Value "Container Apps Environment number to use, or n to stop" "1" -Required
  if ($choice -match '^(n|no)$') {
    throw "Existing Container Apps environments were declined. This subscription may be limited to one Container Apps Environment; re-run with another subscription or delete an existing environment."
  }

  $choiceNumber = 0
  if (-not [int]::TryParse($choice, [ref]$choiceNumber) -or $choiceNumber -lt 1 -or $choiceNumber -gt $environments.Count) {
    throw "Invalid Container Apps Environment selection: $choice"
  }

  Set-ContainerAppEnvironmentFromExisting -Environment $environments[$choiceNumber - 1]
}

function New-StorageName {
  $suffix = Get-Random -Minimum 1000 -Maximum 9999
  return "stngoconnectors$suffix"
}

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $candidate = Join-Path $PSScriptRoot ".env"
  if (Test-Path -LiteralPath $candidate) { $EnvFile = $candidate }
}
$envVars = if ([string]::IsNullOrWhiteSpace($EnvFile)) { @{} } else { Read-EnvFile -Path $EnvFile }

$DeployTarget = Get-EnvValue $envVars @("DEPLOY_TARGET") $DeployTarget "container-app"
$Location = Get-EnvValue $envVars @("AZURE_LOCATION") $Location "eastus"
$Location = Normalize-AzureLocation $Location
$ResourceGroupName = Get-EnvValue $envVars @("AZURE_RESOURCE_GROUP") $ResourceGroupName "rg-ngo-connectors"
$FunctionAppNamePrefix = Get-EnvValue $envVars @("FUNCTION_APP_NAME_PREFIX") $FunctionAppNamePrefix ""
$FunctionAppNameSuffix = Get-EnvValue $envVars @("FUNCTION_APP_NAME_SUFFIX") $FunctionAppNameSuffix ""
$StorageAccountName = Get-EnvValue $envVars @("AZURE_STORAGE_ACCOUNT") $StorageAccountName (New-StorageName)
$AppServicePlanName = Get-EnvValue $envVars @("AZURE_APP_SERVICE_PLAN") $AppServicePlanName "plan-ngo-connectors"
$PlanSku = Get-EnvValue $envVars @("AZURE_PLAN_SKU") $PlanSku "EP1"
$ContainerRegistryName = Get-EnvValue $envVars @("AZURE_CONTAINER_REGISTRY") $ContainerRegistryName ("crngo" + (Get-Random -Minimum 1000 -Maximum 9999))
$ContainerAppEnvironmentName = Get-EnvValue $envVars @("AZURE_CONTAINER_APP_ENV") $ContainerAppEnvironmentName "cae-ngo-connectors"
$ContainerCpu = Get-EnvValue $envVars @("CONTAINER_CPU") $ContainerCpu "1.0"
$ContainerMemory = Get-EnvValue $envVars @("CONTAINER_MEMORY") $ContainerMemory "2.0Gi"
$AzureTenantId = Get-EnvValue $envVars @("AZURE_TENANT_ID", "AZURE_DEPLOYMENT_TENANT_ID") $AzureTenantId ""
$AzureSubscriptionId = Get-EnvValue $envVars @("AZURE_SUBSCRIPTION_ID", "AZURE_SUBSCRIPTION") $AzureSubscriptionId ""
$TenantId = Get-EnvValue $envVars @("MICROSOFT_TENANT_ID", "TENANT_ID") $TenantId ""
$ClientId = Get-EnvValue $envVars @("AZURE_CLIENT_ID", "CLIENT_ID") $ClientId ""
$ClientSecret = Get-EnvValue $envVars @("SECRET_AZURE_CLIENT_SECRET", "CLIENT_SECRET") $ClientSecret ""
$ConnectorStatePath = Get-EnvValue $envVars @("CONNECTOR_STATE_PATH") $ConnectorStatePath "./state"
$PlatformUrl = Get-EnvValue $envVars @("PLATFORM_URL") $PlatformUrl ""
$PlatformTenantId = Get-EnvValue $envVars @("PLATFORM_TENANT_ID") $PlatformTenantId "internal"
$RegistrySharedSecret = Get-EnvValue $envVars @("REGISTRY_SHARED_SECRET") $RegistrySharedSecret ""
if (-not $SetAppSettings -and $envVars.ContainsKey("SET_APP_SETTINGS")) { $SetAppSettings = ($envVars["SET_APP_SETTINGS"] -eq "true") }
if (-not $Provision -and $envVars.ContainsKey("NGO_DEPLOY_PROVISION")) { $Provision = ($envVars["NGO_DEPLOY_PROVISION"] -eq "true") }
if (-not $Crawl -and $envVars.ContainsKey("NGO_DEPLOY_CRAWL")) { $Crawl = ($envVars["NGO_DEPLOY_CRAWL"] -eq "true") }
if ([string]::IsNullOrWhiteSpace($ClientId)) { $AutoCreateEntraApp = $true }
$SelectedContainerAppEnvironmentFromSubscription = $false

Write-Host ""
Write-Host "  NGO Connectors — Deploy All" -ForegroundColor Cyan
Write-Host ""

if (-not $NonInteractive) {
  $DeployTarget = Prompt-Value "Deployment target (azure-functions/container-app)" $DeployTarget -Required
  if ($DeployTarget -notin @("azure-functions", "container-app")) { throw "Invalid deployment target: $DeployTarget" }
  $AzureTenantId = Prompt-Value "Azure tenant ID for deployment" $AzureTenantId -Required
  $AzureSubscriptionId = Prompt-Value "Azure subscription ID or name for deployment" $AzureSubscriptionId -Required
  if ($DeployTarget -eq "container-app" -and -not $PlanOnly) {
    Select-ContainerAppEnvironmentFromSubscription
  }
  if (-not $SelectedContainerAppEnvironmentFromSubscription) {
    $Location = Prompt-AzureUsRegion $Location
    $ResourceGroupName = Prompt-Value "Resource group" $ResourceGroupName -Required
  } else {
    Write-Host "  ℹ Using resource group '$ResourceGroupName' and location '$Location' from the selected Container Apps Environment." -ForegroundColor Gray
  }
  $FunctionAppNamePrefix = Prompt-Value "Function App name prefix" $FunctionAppNamePrefix
  $FunctionAppNameSuffix = Prompt-Value "Function App name suffix" $FunctionAppNameSuffix
  $StorageAccountName = Prompt-Value "Shared storage account name" $StorageAccountName -Required
  if ($DeployTarget -eq "container-app") {
    $ContainerRegistryName = Prompt-Value "Shared Azure Container Registry name" $ContainerRegistryName -Required
    if (-not $SelectedContainerAppEnvironmentFromSubscription) {
      $ContainerAppEnvironmentName = Prompt-Value "Shared Container Apps Environment name" $ContainerAppEnvironmentName -Required
    } else {
      Write-Host "  ℹ Shared Container Apps Environment: $ContainerAppEnvironmentName" -ForegroundColor Gray
    }
    $ContainerCpu = Prompt-Value "Container CPU" $ContainerCpu -Required
    $ContainerMemory = Prompt-Value "Container memory" $ContainerMemory -Required
  } else {
    $AppServicePlanName = Prompt-Value "Shared App Service Plan name" $AppServicePlanName -Required
    $PlanSku = Prompt-Value "Plan SKU" $PlanSku -Required
  }
  $TenantId = Prompt-Value "Microsoft 365 tenant ID for Graph connector auth" ($(if ([string]::IsNullOrWhiteSpace($TenantId)) { $AzureTenantId } else { $TenantId })) -Required
  if (-not $AutoCreateEntraApp) {
    $ClientId = Prompt-Value "Existing Entra app client ID shared by all connectors" $ClientId -Required
    if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
      $ClientSecret = Prompt-Value "Existing Entra app client secret" "" -Secret -Required
    }
  }
  $set = Prompt-Value "Configure Function App settings? (y/n)" "y"
  $SetAppSettings = ($set -match '^(y|yes)$')
  $provision = Prompt-Value "Provision each Microsoft Graph connector after deployment? (y/n)" "y"
  $Provision = ($provision -match '^(y|yes)$')
  $crawl = Prompt-Value "Trigger initial crawls after provisioning? (y/n)" "y"
  $Crawl = ($crawl -match '^(y|yes)$')
}

foreach ($connector in $ConnectorName) {
  $scriptPath = Join-Path $PSScriptRoot "$connector\deploy.ps1"
  if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Deployment script not found: $scriptPath" }

  $functionAppName = "$FunctionAppNamePrefix$connector$FunctionAppNameSuffix"

  Write-Host ""
  Write-Host "==== Deploying $connector as $functionAppName ====" -ForegroundColor Cyan

  $previous = @{}
  $envNames = @(
    "DEPLOY_TARGET",
    "FUNCTION_APP_NAME",
    "AZURE_RESOURCE_GROUP",
    "AZURE_LOCATION",
    "AZURE_STORAGE_ACCOUNT",
    "AZURE_APP_SERVICE_PLAN",
    "AZURE_PLAN_SKU",
    "AZURE_CONTAINER_REGISTRY",
    "AZURE_CONTAINER_APP_ENV",
    "CONTAINER_CPU",
    "CONTAINER_MEMORY",
    "AZURE_TENANT_ID",
    "AZURE_DEPLOYMENT_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "MICROSOFT_TENANT_ID",
    "TENANT_ID",
    "AZURE_CLIENT_ID",
    "CLIENT_ID",
    "SECRET_AZURE_CLIENT_SECRET",
    "CLIENT_SECRET",
    "CONNECTOR_STATE_PATH",
    "PLATFORM_URL",
    "PLATFORM_TENANT_ID",
    "REGISTRY_SHARED_SECRET",
    "AZURE_FUNCTION_KEY",
    "SET_APP_SETTINGS",
    "NGO_DEPLOY_ADDITIONAL_APP_SETTINGS",
    "NGO_DEPLOY_SKIP_RESTORE",
    "NGO_DEPLOY_SKIP_BUILD",
    "NGO_DEPLOY_SKIP_PUBLISH",
    "NGO_DEPLOY_PROVISION",
    "NGO_DEPLOY_CRAWL",
    "NGO_DEPLOY_NONINTERACTIVE",
    "NGO_DEPLOY_AUTO_CREATE_ENTRA_APP",
    "NGO_DEPLOY_GRANT_ADMIN_CONSENT",
    "NGO_DEPLOY_PLAN_ONLY"
  )
  foreach ($name in $envNames) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }

  try {
    $env:DEPLOY_TARGET = $DeployTarget
    $env:FUNCTION_APP_NAME = $functionAppName
    $env:AZURE_RESOURCE_GROUP = $ResourceGroupName
    $env:AZURE_LOCATION = $Location
    $env:AZURE_STORAGE_ACCOUNT = $StorageAccountName
    $env:AZURE_APP_SERVICE_PLAN = $AppServicePlanName
    $env:AZURE_PLAN_SKU = $PlanSku
    $env:AZURE_CONTAINER_REGISTRY = $ContainerRegistryName
    $env:AZURE_CONTAINER_APP_ENV = $ContainerAppEnvironmentName
    $env:CONTAINER_CPU = $ContainerCpu
    $env:CONTAINER_MEMORY = $ContainerMemory
    $env:AZURE_TENANT_ID = $AzureTenantId
    $env:AZURE_DEPLOYMENT_TENANT_ID = $AzureTenantId
    $env:AZURE_SUBSCRIPTION_ID = $AzureSubscriptionId
    $env:MICROSOFT_TENANT_ID = $TenantId
    $env:TENANT_ID = $TenantId
    $env:AZURE_CLIENT_ID = $ClientId
    $env:CLIENT_ID = $ClientId
    $env:SECRET_AZURE_CLIENT_SECRET = $ClientSecret
    $env:CLIENT_SECRET = $ClientSecret
    $env:CONNECTOR_STATE_PATH = $ConnectorStatePath
    $env:PLATFORM_URL = $PlatformUrl
    $env:PLATFORM_TENANT_ID = $PlatformTenantId
    $env:REGISTRY_SHARED_SECRET = $RegistrySharedSecret
    $env:AZURE_FUNCTION_KEY = $FunctionKey
    $env:SET_APP_SETTINGS = if ($SetAppSettings) { "true" } else { "false" }
    $env:NGO_DEPLOY_ADDITIONAL_APP_SETTINGS = if ($AdditionalAppSetting.Count -gt 0) { $AdditionalAppSetting | ConvertTo-Json -Compress } else { "" }
    $env:NGO_DEPLOY_SKIP_RESTORE = if ($SkipRestore) { "true" } else { "false" }
    $env:NGO_DEPLOY_SKIP_BUILD = if ($SkipBuild) { "true" } else { "false" }
    $env:NGO_DEPLOY_SKIP_PUBLISH = if ($SkipPublish) { "true" } else { "false" }
    $env:NGO_DEPLOY_PROVISION = if ($Provision) { "true" } else { "false" }
    $env:NGO_DEPLOY_CRAWL = if ($Crawl) { "true" } else { "false" }
    $env:NGO_DEPLOY_NONINTERACTIVE = "true"
    $env:NGO_DEPLOY_AUTO_CREATE_ENTRA_APP = if ($AutoCreateEntraApp) { "true" } else { "false" }
    $env:NGO_DEPLOY_GRANT_ADMIN_CONSENT = if ($GrantAdminConsent) { "true" } else { "false" }
    $env:NGO_DEPLOY_PLAN_ONLY = if ($PlanOnly) { "true" } else { "false" }

    & $scriptPath
  } finally {
    foreach ($name in $envNames) {
      [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process")
    }
  }
}

Write-Host ""
Write-Host "All connector deployment scripts completed." -ForegroundColor Green

# Optional: build M365 declarative agent packages
if ($BuildAgentPackages -or $DeployAgentPackages) {
  Write-Host ""
  Write-Host "==== Building Microsoft 365 declarative agent packages ====" -ForegroundColor Cyan
  $buildScript = Join-Path $PSScriptRoot "build-agent-packages.ps1"
  if (Test-Path -LiteralPath $buildScript) {
    & $buildScript
  } else {
    Write-Host "  WARN build-agent-packages.ps1 not found; skipping package build." -ForegroundColor Yellow
  }
}

# Optional: deploy agent packages to the M365 app catalog
if ($DeployAgentPackages) {
  Write-Host ""
  Write-Host "==== Deploying declarative agents to Microsoft 365 ====" -ForegroundColor Cyan
  $deployScript = Join-Path $PSScriptRoot "deploy-agent-packages.ps1"
  if (Test-Path -LiteralPath $deployScript) {
    $deployArgs = @{}
    if (-not [string]::IsNullOrWhiteSpace($TenantId)) { $deployArgs.Tenant = $TenantId }
    if ($NonInteractive) { $deployArgs.NonInteractive = $true }
    & $deployScript @deployArgs
  } else {
    Write-Host "  WARN deploy-agent-packages.ps1 not found; skipping agent deployment." -ForegroundColor Yellow
  }
}
