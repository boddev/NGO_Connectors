<#
.SYNOPSIS
  Interactive deployment helper for one NGO connector.

.DESCRIPTION
  Deploys a connector either to Azure Functions or to Azure Functions on Azure
  Container Apps. The script can read a .env file, prompt for missing values,
  provision Azure resources, optionally create an Entra ID app registration,
  configure app settings, build/publish, and optionally call the connector's
  provision and onDemandCrawl endpoints.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ConnectorPath,

  [string]$EnvFile = "",
  [ValidateSet("azure-functions", "container-app")]
  [string]$DeployTarget = "",
  [string]$FunctionAppName = "",
  [string]$ResourceGroupName = "",
  [string]$Location = "",
  [string]$StorageAccountName = "",
  [string]$AppServicePlanName = "",
  [string]$PlanSku = "",
  [string]$ContainerRegistryName = "",
  [string]$ContainerAppEnvironmentName = "",
  [string]$ContainerCpu = "",
  [string]$ContainerMemory = "",
  [string]$AzureTenantId = "",
  [string]$AzureSubscriptionId = "",
  [string]$TenantId = "",
  [string]$ClientId = "",
  [string]$ClientSecret = "",
  [string]$ConnectorStatePath = "",
  [string]$PlatformUrl = "",
  [string]$PlatformTenantId = "",
  [string]$RegistrySharedSecret = "",
  [string[]]$AdditionalAppSetting = @(),
  [switch]$SetAppSettings,
  [switch]$SkipRestore,
  [switch]$SkipBuild,
  [switch]$SkipPublish,
  [switch]$Provision,
  [switch]$Crawl,
  [string]$FunctionKey = "",
  [switch]$NonInteractive,
  [switch]$AutoCreateEntraApp,
  [switch]$GrantAdminConsent,
  [switch]$PlanOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$env:AZURE_CORE_NO_PROMPT = "true"
$env:AZURE_EXTENSION_USE_DYNAMIC_INSTALL = "yes_without_prompt"

function Write-Step {
  param([string]$Step, [string]$Message)
  Write-Host ""
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
  Write-Host "  [$Step] $Message" -ForegroundColor Cyan
  Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
}
function Write-Info { param([string]$Msg) Write-Host "  ℹ $Msg" -ForegroundColor Gray }
function Write-Ok { param([string]$Msg) Write-Host "  OK $Msg" -ForegroundColor Green }
function Write-Warn { param([string]$Msg) Write-Host "  WARN $Msg" -ForegroundColor Yellow }
function Test-Command { param([string]$Name) return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

function Add-AzureSubscriptionScope {
  param([string[]]$Arguments)
  if ($Arguments.Count -eq 0 -or $Arguments -contains "--subscription" -or [string]::IsNullOrWhiteSpace($AzureSubscriptionId)) {
    return $Arguments
  }

  $unscopedGroups = @("account", "ad", "login")
  if ($Arguments[0] -in $unscopedGroups) { return $Arguments }

  return @($Arguments) + @("--subscription", $AzureSubscriptionId)
}

function Invoke-AzCmd {
  param([string[]]$Arguments, [switch]$AllowFailure)
  $effectiveArguments = Add-AzureSubscriptionScope -Arguments $Arguments
  if ($effectiveArguments -notcontains "--only-show-errors") {
    $effectiveArguments = @($effectiveArguments) + @("--only-show-errors")
  }
  $result = & az @effectiveArguments 2>&1
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
    throw "Azure CLI command failed: az $($effectiveArguments -join ' ')`n$($result -join "`n")"
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
    $key = $trimmed.Substring(0, $eq).Trim()
    $value = $trimmed.Substring($eq + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $vars[$key] = $value
  }
  return $vars
}

function Get-ConfigValue {
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
  param([string]$Label, [string]$Default = "", [switch]$Secret, [switch]$Required)
  if ($NonInteractive) {
    if ($Required -and [string]::IsNullOrWhiteSpace($Default)) { throw "Required value missing in non-interactive mode: $Label" }
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

function Prompt-YesNo {
  param([string]$Label, [bool]$Default = $true)
  if ($NonInteractive) { return $Default }

  $defaultText = if ($Default) { "y" } else { "n" }
  $answer = Prompt-Value $Label $defaultText
  return ($answer -match '^(y|yes)$')
}

function Confirm-UseExistingResource {
  param([string]$ResourceType, [string]$Name)
  if (Prompt-YesNo "Found existing $ResourceType '$Name'. Use it? (y/n)" $true) {
    return
  }

  throw "Existing $ResourceType '$Name' was declined. Re-run with a different $ResourceType name to create a new resource."
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

function Get-ContainerAppEnvironments {
  $environments = Invoke-AzJson -Arguments @("containerapp", "env", "list", "--query", "[].{name:name,resourceGroup:resourceGroup,location:location,id:id}", "--output", "json", "--only-show-errors") -AllowFailure
  if ($null -eq $environments -or $LASTEXITCODE -ne 0) { return @() }

  $environmentList = @($environments)
  $validEnvironments = @($environmentList | Where-Object { -not [string]::IsNullOrWhiteSpace((Get-ObjectStringProperty $_ "name")) })
  if ($validEnvironments.Count -lt $environmentList.Count) {
    Write-Warn "Ignored $($environmentList.Count - $validEnvironments.Count) Container Apps Environment list item(s) because Azure CLI did not return a name."
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
  if (-not [string]::IsNullOrWhiteSpace($resourceGroup) -and $resourceGroup -ne $script:ResourceGroupName) {
    Write-Warn "Using Container Apps environment '$name' in resource group '$resourceGroup'. Function Apps on Container Apps must use that resource group, so the deployment resource group was updated from '$script:ResourceGroupName' to '$resourceGroup'."
    $script:ResourceGroupName = $resourceGroup
  }

  $script:SelectedContainerAppEnvironmentFromSubscription = $true
  Write-Ok "Selected existing Container Apps environment: $name"
}

function Select-ContainerAppEnvironmentFromSubscription {
  if ($DeployTarget -ne "container-app") { return }

  $environments = @(Get-ContainerAppEnvironments)
  if ($environments.Count -eq 0) { return }

  $matching = @($environments | Where-Object {
      (Get-ObjectStringProperty $_ "name") -eq $ContainerAppEnvironmentName -and
      (Get-ContainerAppEnvironmentResourceGroup $_) -eq $ResourceGroupName
    })
  if ($matching.Count -gt 0) { return }

  if ($NonInteractive) {
    $first = $environments[0]
    $name = Get-ObjectStringProperty $first "name"
    Write-Warn "Found an existing Container Apps environment in this subscription. Reusing '$name' because subscriptions may be limited to one Container Apps Environment."
    Set-ContainerAppEnvironmentFromExisting -Environment $first
    return
  }

  if ($environments.Count -eq 1) {
    $environment = $environments[0]
    $name = Get-ObjectStringProperty $environment "name"
    $resourceGroup = Get-ContainerAppEnvironmentResourceGroup $environment
    $location = Get-ObjectStringProperty $environment "location"
    if (Prompt-YesNo "Found existing Container Apps environment '$name' in resource group '$resourceGroup' ($location). Use it? (y/n)" $true) {
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

function New-SafeName {
  param([string]$Value, [int]$Max = 50)
  $safe = ($Value.ToLowerInvariant() -replace '[^a-z0-9-]', '-').Trim('-')
  if ($safe.Length -gt $Max) { $safe = $safe.Substring(0, $Max).Trim('-') }
  return $safe
}

function New-StorageName {
  param([string]$ConnectorName)
  $base = ("st" + ($ConnectorName.ToLowerInvariant() -replace '[^a-z0-9]', ''))
  if ($base.Length -gt 18) { $base = $base.Substring(0, 18) }
  $suffix = (Get-Random -Minimum 1000 -Maximum 9999)
  return "$base$suffix"
}

function Set-FunctionAppSettings {
  param([string]$AppName, [string]$ResourceGroup, [hashtable]$Settings)
  $tokenInfo = Invoke-AzJson -Arguments @("account", "get-access-token", "--resource", "https://management.azure.com")
  $accountInfo = Invoke-AzJson -Arguments @("account", "show", "--subscription", $AzureSubscriptionId)
  $headers = @{
    "Authorization" = "Bearer $($tokenInfo.accessToken)"
    "Content-Type"  = "application/json"
  }
  $baseUrl = "https://management.azure.com/subscriptions/$($accountInfo.id)/resourceGroups/$([Uri]::EscapeDataString($ResourceGroup))/providers/Microsoft.Web/sites/$([Uri]::EscapeDataString($AppName))"
  $existing = Invoke-RestMethod -Uri "$baseUrl/config/appsettings/list?api-version=2023-12-01" -Method Post -Headers $headers
  $merged = @{}
  if ($existing.properties) {
    foreach ($prop in $existing.properties.PSObject.Properties) { $merged[$prop.Name] = $prop.Value }
  }
  foreach ($key in $Settings.Keys) { $merged[$key] = $Settings[$key] }
  $body = @{ properties = $merged } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Uri "$baseUrl/config/appsettings?api-version=2023-12-01" -Method Put -Headers $headers -Body $body | Out-Null
}

function Invoke-External {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$CommandArguments = @()
  )
  $resolvedCommand = Resolve-ExternalCommand -Command $Command
  & $resolvedCommand @CommandArguments
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $resolvedCommand $($CommandArguments -join ' ')" }
}

function Resolve-ExternalCommand {
  param([Parameter(Mandatory = $true)][string]$Command)
  $resolvedCommand = $Command
  $runningOnWindows = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::Windows)
  if ($runningOnWindows -and [string]::IsNullOrWhiteSpace([IO.Path]::GetExtension($Command))) {
    $cmdShim = Get-Command "$Command.cmd" -ErrorAction SilentlyContinue
    if ($cmdShim) { $resolvedCommand = $cmdShim.Source }
  }
  return $resolvedCommand
}

function Invoke-ExternalOutput {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Command,
    [string[]]$CommandArguments = @()
  )
  $resolvedCommand = Resolve-ExternalCommand -Command $Command
  $output = & $resolvedCommand @CommandArguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code ${LASTEXITCODE}: $resolvedCommand $($CommandArguments -join ' ')`n$($output -join "`n")" }
  return ($output | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }) -join "`n"
}

function Add-GraphPermissions {
  param([string]$AppId)
  $graphAppId = "00000003-0000-0000-c000-000000000000"
  $permissions = @(
    "f431331c-49a6-499f-be1c-62af19c34a9d", # ExternalConnection.ReadWrite.OwnedBy
    "8116ae0f-55c2-452d-9944-d18420f5b2c8"  # ExternalItem.ReadWrite.OwnedBy
  )
  $failedPermissions = @()
  foreach ($permissionId in $permissions) {
    Invoke-AzCmd -Arguments @("ad", "app", "permission", "add", "--id", $AppId, "--api", $graphAppId, "--api-permissions", "$permissionId=Role") -AllowFailure | Out-Null
    if ($LASTEXITCODE -ne 0) { $failedPermissions += $permissionId }
  }
  if ($failedPermissions.Count -gt 0) {
    Write-Warn "Some Graph application permissions could not be added automatically: $($failedPermissions -join ', ')"
  } else {
    Write-Ok "Graph application permissions configured"
  }
}

function Grant-GraphAdminConsent {
  param([string]$AppId)
  Write-Info "Attempting admin consent for Graph application permissions..."
  Start-Sleep -Seconds 5
  Invoke-AzCmd -Arguments @("ad", "app", "permission", "admin-consent", "--id", $AppId) -AllowFailure | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Ok "Admin consent granted"
    Write-Info "Waiting 30 seconds for consent propagation..."
    Start-Sleep -Seconds 30
  } else {
    Write-Warn "Admin consent could not be granted automatically. Sign in as a tenant admin or grant consent manually in Entra ID."
  }
}

function Get-GraphAccessToken {
  param([string]$GraphTenantId, [string]$GraphClientId, [string]$GraphClientSecret)
  if ([string]::IsNullOrWhiteSpace($GraphTenantId) -or [string]::IsNullOrWhiteSpace($GraphClientId) -or [string]::IsNullOrWhiteSpace($GraphClientSecret)) {
    throw "Tenant ID, client ID, and client secret are required for direct Microsoft Graph provisioning."
  }

  $body = @{
    client_id     = $GraphClientId
    client_secret = $GraphClientSecret
    scope         = "https://graph.microsoft.com/.default"
    grant_type    = "client_credentials"
  }

  $maxRetries = 5
  $retryDelay = 15
  for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
    try {
      $token = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/$GraphTenantId/oauth2/v2.0/token" -Body $body -ContentType "application/x-www-form-urlencoded"
      if (-not [string]::IsNullOrWhiteSpace($token.access_token)) {
        return $token.access_token
      }
    } catch {
      if ($attempt -lt $maxRetries) {
        Write-Warn "Token acquisition attempt $attempt failed, retrying in ${retryDelay}s..."
        Start-Sleep -Seconds $retryDelay
        $retryDelay = $retryDelay * 2
      } else {
        throw
      }
    }
  }
  throw "Failed to acquire Graph access token after $maxRetries attempts."
}

function Invoke-GraphRequest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [Parameter(Mandatory = $true)]
    [string]$AccessToken,
    [object]$Body = $null,
    [int[]]$ExpectedStatus = @(200),
    [switch]$ReturnRaw
  )

  $headers = @{
    Authorization = "Bearer $AccessToken"
    "Content-Type" = "application/json"
  }
  $request = @{
    Method = $Method
    Uri = $Uri
    Headers = $headers
    SkipHttpErrorCheck = $true
    StatusCodeVariable = "statusCode"
  }
  if ($null -ne $Body) {
    $request.Body = ($Body | ConvertTo-Json -Depth 50)
  }

  $response = Invoke-RestMethod @request
  if ($ExpectedStatus -notcontains $statusCode) {
    if ([int]$statusCode -eq 401) {
      Write-Warn "Graph API returned 401 (consent may still be propagating). Retrying in 30s..."
      Start-Sleep -Seconds 30
      $response = Invoke-RestMethod @request
      if ($ExpectedStatus -notcontains $statusCode) {
        $responseText = if ($null -eq $response) { "" } else { $response | ConvertTo-Json -Depth 20 }
        throw "Microsoft Graph request failed ($statusCode): $Method $Uri`n$responseText"
      }
    } else {
      $responseText = if ($null -eq $response) { "" } else { $response | ConvertTo-Json -Depth 20 }
      throw "Microsoft Graph request failed ($statusCode): $Method $Uri`n$responseText"
    }
  }
  if ($ReturnRaw) { return @{ StatusCode = $statusCode; Body = $response } }
  return $response
}

function Get-ConnectorGraphConfig {
  param([string]$CompiledConnectorPath)
  $connectionPath = Join-Path $CompiledConnectorPath "dist\config\connection.js"
  $schemaPath = Join-Path $CompiledConnectorPath "dist\config\schema.js"
  if (-not (Test-Path -LiteralPath $connectionPath) -or -not (Test-Path -LiteralPath $schemaPath)) {
    throw "Compiled connector Graph config was not found. Run the build step before provisioning Graph."
  }

  Push-Location $CompiledConnectorPath
  try {
    $script = @"
const connection = require('./dist/config/connection.js');
const schema = require('./dist/config/schema.js');
console.log(JSON.stringify({
  connectionId: connection.connectionId,
  connectionPayload: connection.connectionPayload,
  schema: schema.schema
}));
"@
    $json = Invoke-ExternalOutput -Command "node" -CommandArguments @("-e", $script)
    return $json | ConvertFrom-Json -Depth 50
  } finally {
    Pop-Location
  }
}

function Get-GraphConnectionCreatePayload {
  param([object]$Config)

  $connectionId = [string]$Config.connectionId
  $payload = $Config.connectionPayload
  if ([string]::IsNullOrWhiteSpace($connectionId)) {
    $connectionId = Get-ObjectStringProperty $payload "id"
  }
  if ([string]::IsNullOrWhiteSpace($connectionId)) {
    throw "Compiled connector Graph config did not include a connection ID."
  }

  $name = Get-ObjectStringProperty $payload "name"
  if ([string]::IsNullOrWhiteSpace($name)) {
    throw "Compiled connector Graph config did not include a connection name."
  }

  $description = Get-ObjectStringProperty $payload "description"
  if ($description.Length -gt 512) {
    Write-Warn "Graph connection description exceeded 512 characters; trimming before provisioning."
    $description = $description.Substring(0, 512)
  }

  return [ordered]@{
    id          = $connectionId
    name        = $name
    description = $description
  }
}

function Invoke-GraphActivitySettingsPatch {
  param(
    [string]$GraphBase,
    [string]$ConnectionId,
    [string]$AccessToken,
    [object]$ConnectionPayload
  )

  $activitySettingsProperty = $ConnectionPayload.PSObject.Properties["activitySettings"]
  if ($null -eq $activitySettingsProperty -or $null -eq $activitySettingsProperty.Value) { return }

  try {
    Invoke-GraphRequest `
      -Method "PATCH" `
      -Uri "$GraphBase/external/connections/$ConnectionId" `
      -AccessToken $AccessToken `
      -Body @{ activitySettings = $activitySettingsProperty.Value } `
      -ExpectedStatus @(200, 204) | Out-Null
    Write-Ok "Configured Graph URL-to-item resolver"
  } catch {
    Write-Warn "Graph URL-to-item resolver configuration was skipped because Microsoft Graph rejected the activitySettings payload. Connection provisioning and crawl will continue. $($_.Exception.Message)"
  }
}

function Get-GraphSchemaState {
  param([object]$SchemaResponse)

  $statusProp = $SchemaResponse.PSObject.Properties["status"]
  if ($null -ne $statusProp -and $null -ne $statusProp.Value) {
    $statusVal = $statusProp.Value
    if ($statusVal -is [string]) { return $statusVal }
    $stateProp = $statusVal.PSObject.Properties["state"]
    if ($null -ne $stateProp -and $null -ne $stateProp.Value) { return [string]$stateProp.Value }
  }

  $propsProp = $SchemaResponse.PSObject.Properties["properties"]
  if ($null -ne $propsProp -and $null -ne $propsProp.Value -and @($propsProp.Value).Count -gt 0) {
    return "completed"
  }

  return "unknown"
}

function Invoke-GraphConnectorProvision {
  param([string]$CompiledConnectorPath)

  Write-Step "8/9" "Provisioning Graph External Connection"
  $config = Get-ConnectorGraphConfig -CompiledConnectorPath $CompiledConnectorPath
  $accessToken = Get-GraphAccessToken -GraphTenantId $TenantId -GraphClientId $ClientId -GraphClientSecret $ClientSecret
  $graphBase = "https://graph.microsoft.com/v1.0"
  $connectionCreatePayload = Get-GraphConnectionCreatePayload -Config $config
  $connectionId = [string]$connectionCreatePayload.id

  $existing = Invoke-GraphRequest -Method "GET" -Uri "$graphBase/external/connections/$connectionId" -AccessToken $accessToken -ExpectedStatus @(200, 404) -ReturnRaw
  if ($existing.StatusCode -eq 404) {
    Invoke-GraphRequest -Method "POST" -Uri "$graphBase/external/connections" -AccessToken $accessToken -Body $connectionCreatePayload -ExpectedStatus @(200, 201, 202) | Out-Null
    Write-Ok "Created Graph external connection: $connectionId"
  } else {
    Write-Ok "Graph external connection exists: $connectionId"
  }

  # Enable Copilot visibility and set content category via beta API
  try {
    $betaBase = "https://graph.microsoft.com/beta"
    Invoke-GraphRequest -Method "PATCH" -Uri "$betaBase/external/connections/$connectionId" -AccessToken $accessToken -Body @{
      enabledContentExperiences = "search"
      contentCategory = "knowledgeBase"
    } -ExpectedStatus @(200, 204) | Out-Null
    Write-Ok "Copilot visibility enabled"
  } catch {
    Write-Warn "Could not enable Copilot visibility: $($_.Exception.Message)"
  }

  Invoke-GraphActivitySettingsPatch -GraphBase $graphBase -ConnectionId $connectionId -AccessToken $accessToken -ConnectionPayload $config.connectionPayload

  Invoke-GraphRequest -Method "PATCH" -Uri "$graphBase/external/connections/$connectionId/schema" -AccessToken $accessToken -Body $config.schema -ExpectedStatus @(200, 202) | Out-Null
  Write-Ok "Submitted Graph connector schema"

  $maxAttempts = 30
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $schemaStatus = Invoke-GraphRequest -Method "GET" -Uri "$graphBase/external/connections/$connectionId/schema" -AccessToken $accessToken -ExpectedStatus @(200)
    $state = Get-GraphSchemaState -SchemaResponse $schemaStatus
    Write-Info "Schema status attempt ${attempt}/${maxAttempts}: $state"
    if ($state -eq "completed") {
      Write-Ok "Graph connector schema completed"
      return
    }
    if ($state -eq "failed") {
      throw "Graph connector schema registration failed: $($schemaStatus.status | ConvertTo-Json -Depth 10)"
    }
    Start-Sleep -Seconds 30
  }

  throw "Graph connector schema registration timed out after 15 minutes."
}

function Invoke-FunctionPostWithRetry {
  param(
    [string]$Uri,
    [int]$TimeoutSec,
    [int]$MaxAttempts = 12,
    [int]$DelaySeconds = 15
  )

  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    try {
      return Invoke-RestMethod -Method Post -Uri $Uri -TimeoutSec $TimeoutSec
    } catch {
      if ($attempt -eq $MaxAttempts) { throw }
      Write-Warn "Function endpoint not ready yet (attempt ${attempt}/${MaxAttempts}). Retrying in ${DelaySeconds}s..."
      Start-Sleep -Seconds $DelaySeconds
    }
  }
}

function Get-EntraAppByAppId {
  param([string]$AppId)
  if ([string]::IsNullOrWhiteSpace($AppId)) { return $null }
  return Invoke-AzJson -Arguments @("ad", "app", "show", "--id", $AppId) -AllowFailure
}

function Get-EntraAppByDisplayName {
  param([string]$DisplayName)
  $apps = Invoke-AzJson -Arguments @("ad", "app", "list", "--display-name", $DisplayName) -AllowFailure
  if ($null -eq $apps) { return @() }
  return ,@($apps | Where-Object { $_.displayName -eq $DisplayName })
}

function Ensure-TenantLogin {
  param([string]$TargetTenantId, [string]$Purpose)
  if ([string]::IsNullOrWhiteSpace($TargetTenantId)) { throw "Tenant ID is required for $Purpose." }

  $account = Invoke-AzJson -Arguments @("account", "show") -AllowFailure
  if ($null -eq $account -or $LASTEXITCODE -ne 0 -or $account.tenantId -ne $TargetTenantId) {
    Write-Info "Opening browser for Azure login to $Purpose tenant $TargetTenantId..."
    Invoke-AzCmd -Arguments @("login", "--tenant", $TargetTenantId) | Out-Null
  }
}

function Get-FunctionBaseUrl {
  param([string]$AppName, [string]$ResourceGroup)
  $info = Invoke-AzJson -Arguments @("functionapp", "show", "--name", $AppName, "--resource-group", $ResourceGroup)
  if (-not $info.defaultHostName) { return "https://$AppName.azurewebsites.net/api" }
  return "https://$($info.defaultHostName)/api"
}

function Get-FunctionHostKey {
  param([string]$AppName, [string]$ResourceGroup)
  $keys = Invoke-AzJson -Arguments @("functionapp", "keys", "list", "--name", $AppName, "--resource-group", $ResourceGroup) -AllowFailure
  if ($keys -and $keys.functionKeys -and $keys.functionKeys.default) { return $keys.functionKeys.default }
  if ($keys -and $keys.masterKey) { return $keys.masterKey }
  return ""
}

function Register-ResourceProvider {
  param([string]$Namespace)
  $provider = Invoke-AzJson -Arguments @("provider", "show", "--namespace", $Namespace) -AllowFailure
  if ($provider -and $provider.registrationState -eq "Registered") {
    Write-Ok "$Namespace registered"
    return
  }

  Write-Info "Registering resource provider: $Namespace"
  Invoke-AzCmd -Arguments @("provider", "register", "--namespace", $Namespace, "--wait") | Out-Null
  Write-Ok "$Namespace registered"
}

$resolvedConnectorPath = (Resolve-Path -LiteralPath $ConnectorPath).Path
$connectorName = Split-Path -Leaf $resolvedConnectorPath
$connectorSafe = New-SafeName $connectorName 40
$repoRoot = Split-Path -Parent $resolvedConnectorPath

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $candidate = Join-Path $repoRoot "setup\.env"
  if (Test-Path -LiteralPath $candidate) { $EnvFile = $candidate }
}
$envVars = if ([string]::IsNullOrWhiteSpace($EnvFile)) { @{} } else { Read-EnvFile -Path $EnvFile }

$DeployTarget = Get-ConfigValue $envVars @("DEPLOY_TARGET") $DeployTarget "container-app"
$Location = Get-ConfigValue $envVars @("AZURE_LOCATION") $Location "eastus"
$Location = Normalize-AzureLocation $Location
$ResourceGroupName = Get-ConfigValue $envVars @("AZURE_RESOURCE_GROUP") $ResourceGroupName "rg-ngo-connectors"
$FunctionAppName = Get-ConfigValue $envVars @("AZURE_FUNCTION_APP", "FUNCTION_APP_NAME") $FunctionAppName $connectorSafe
$StorageAccountName = Get-ConfigValue $envVars @("AZURE_STORAGE_ACCOUNT") $StorageAccountName (New-StorageName $connectorName)
$AppServicePlanName = Get-ConfigValue $envVars @("AZURE_APP_SERVICE_PLAN") $AppServicePlanName "plan-ngo-connectors"
$PlanSku = Get-ConfigValue $envVars @("AZURE_PLAN_SKU") $PlanSku "EP1"
$ContainerRegistryName = Get-ConfigValue $envVars @("AZURE_CONTAINER_REGISTRY") $ContainerRegistryName ("crngo" + (Get-Random -Minimum 1000 -Maximum 9999))
$ContainerAppEnvironmentName = Get-ConfigValue $envVars @("AZURE_CONTAINER_APP_ENV") $ContainerAppEnvironmentName "cae-ngo-connectors"
$ContainerCpu = Get-ConfigValue $envVars @("CONTAINER_CPU") $ContainerCpu "1.0"
$ContainerMemory = Get-ConfigValue $envVars @("CONTAINER_MEMORY") $ContainerMemory "2.0Gi"
$AzureTenantId = Get-ConfigValue $envVars @("AZURE_TENANT_ID", "AZURE_DEPLOYMENT_TENANT_ID") $AzureTenantId ""
$AzureSubscriptionId = Get-ConfigValue $envVars @("AZURE_SUBSCRIPTION_ID", "AZURE_SUBSCRIPTION") $AzureSubscriptionId ""
$TenantId = Get-ConfigValue $envVars @("MICROSOFT_TENANT_ID", "TENANT_ID") $TenantId ""
$ClientId = Get-ConfigValue $envVars @("AZURE_CLIENT_ID", "CLIENT_ID") $ClientId ""
$ClientSecret = Get-ConfigValue $envVars @("SECRET_AZURE_CLIENT_SECRET", "CLIENT_SECRET") $ClientSecret ""
$ConnectorStatePath = Get-ConfigValue $envVars @("CONNECTOR_STATE_PATH") $ConnectorStatePath "./state"
$PlatformUrl = Get-ConfigValue $envVars @("PLATFORM_URL") $PlatformUrl ""
$PlatformTenantId = Get-ConfigValue $envVars @("PLATFORM_TENANT_ID") $PlatformTenantId "internal"
$RegistrySharedSecret = Get-ConfigValue $envVars @("REGISTRY_SHARED_SECRET") $RegistrySharedSecret ""
$additionalSettingsJson = Get-ConfigValue $envVars @("NGO_DEPLOY_ADDITIONAL_APP_SETTINGS") "" ""
if (-not [string]::IsNullOrWhiteSpace($additionalSettingsJson)) {
  try {
    $parsedAdditionalSettings = $additionalSettingsJson | ConvertFrom-Json -ErrorAction Stop
    if ($parsedAdditionalSettings -is [array]) {
      foreach ($setting in $parsedAdditionalSettings) { $AdditionalAppSetting += [string]$setting }
    } else {
      $AdditionalAppSetting += [string]$parsedAdditionalSettings
    }
  } catch {
    $AdditionalAppSetting += ($additionalSettingsJson -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  }
}
if (-not $SetAppSettings -and $envVars.ContainsKey("SET_APP_SETTINGS")) { $SetAppSettings = ($envVars["SET_APP_SETTINGS"] -eq "true") }
if (-not $SetAppSettings -and $env:SET_APP_SETTINGS -eq "true") { $SetAppSettings = $true }
if (-not $SkipRestore -and $env:NGO_DEPLOY_SKIP_RESTORE -eq "true") { $SkipRestore = $true }
if (-not $SkipBuild -and $env:NGO_DEPLOY_SKIP_BUILD -eq "true") { $SkipBuild = $true }
if (-not $SkipPublish -and $env:NGO_DEPLOY_SKIP_PUBLISH -eq "true") { $SkipPublish = $true }
if (-not $Provision -and $env:NGO_DEPLOY_PROVISION -eq "true") { $Provision = $true }
if (-not $Crawl -and $env:NGO_DEPLOY_CRAWL -eq "true") { $Crawl = $true }
if (-not $Provision -and $envVars.ContainsKey("NGO_DEPLOY_PROVISION")) { $Provision = ($envVars["NGO_DEPLOY_PROVISION"] -eq "true") }
if (-not $Crawl -and $envVars.ContainsKey("NGO_DEPLOY_CRAWL")) { $Crawl = ($envVars["NGO_DEPLOY_CRAWL"] -eq "true") }
if (-not $NonInteractive -and $env:NGO_DEPLOY_NONINTERACTIVE -eq "true") { $NonInteractive = $true }
if (-not $AutoCreateEntraApp -and $env:NGO_DEPLOY_AUTO_CREATE_ENTRA_APP -eq "true") { $AutoCreateEntraApp = $true }
if (-not $GrantAdminConsent -and $env:NGO_DEPLOY_GRANT_ADMIN_CONSENT -eq "true") { $GrantAdminConsent = $true }
if (-not $PlanOnly -and $env:NGO_DEPLOY_PLAN_ONLY -eq "true") { $PlanOnly = $true }
if ([string]::IsNullOrWhiteSpace($ClientId)) { $AutoCreateEntraApp = $true }
$SelectedContainerAppEnvironmentFromSubscription = $false

Write-Host ""
Write-Host "  NGO Connector Deployment" -ForegroundColor Cyan
Write-Host "  Connector: $connectorName" -ForegroundColor Cyan
Write-Host ""

if (-not $NonInteractive) {
  Write-Step "0/8" "Configuration"
  $DeployTarget = Prompt-Value "Deployment target (azure-functions/container-app)" $DeployTarget -Required
  if ($DeployTarget -notin @("azure-functions", "container-app")) { throw "Invalid deployment target: $DeployTarget" }
  $AzureTenantId = Prompt-Value "Azure tenant ID for deployment" $AzureTenantId -Required
  $AzureSubscriptionId = Prompt-Value "Azure subscription ID or name for deployment" $AzureSubscriptionId -Required
  $Location = Prompt-AzureUsRegion $Location
  $ResourceGroupName = Prompt-Value "Resource group" $ResourceGroupName -Required
  $FunctionAppName = Prompt-Value "Function App name" $FunctionAppName -Required
  $StorageAccountName = Prompt-Value "Storage account name" $StorageAccountName -Required
  if ($DeployTarget -eq "container-app") {
    $ContainerRegistryName = Prompt-Value "Azure Container Registry name" $ContainerRegistryName -Required
    $ContainerAppEnvironmentName = Prompt-Value "Container Apps Environment name" $ContainerAppEnvironmentName -Required
    $ContainerCpu = Prompt-Value "Container CPU" $ContainerCpu -Required
    $ContainerMemory = Prompt-Value "Container memory" $ContainerMemory -Required
  } else {
    $AppServicePlanName = Prompt-Value "App Service Plan name" $AppServicePlanName -Required
    $PlanSku = Prompt-Value "Plan SKU" $PlanSku -Required
  }
  $TenantId = Prompt-Value "Microsoft 365 tenant ID for Graph connector auth" ($(if ([string]::IsNullOrWhiteSpace($TenantId)) { $AzureTenantId } else { $TenantId })) -Required
  if (-not $AutoCreateEntraApp) {
    $ClientId = Prompt-Value "Existing Entra app client ID" $ClientId -Required
    if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
      $ClientSecret = Prompt-Value "Existing Entra app client secret" "" -Secret -Required
    }
  }
  $set = Prompt-Value "Configure Function App settings? (y/n)" ($(if ($SetAppSettings) { "y" } else { "y" }))
  $SetAppSettings = ($set -match '^(y|yes)$')
  $Provision = Prompt-YesNo "Provision the Microsoft Graph connector in the admin portal after deployment? (y/n)" $true
  $Crawl = Prompt-YesNo "Trigger an initial crawl after provisioning? (y/n)" $true
}

Write-Host ""
Write-Host "  Summary" -ForegroundColor White
Write-Info "Target:             $DeployTarget"
Write-Info "Function App:       $FunctionAppName"
Write-Info "Resource Group:     $ResourceGroupName"
Write-Info "Location:           $Location"
Write-Info "Azure Tenant:       $AzureTenantId"
Write-Info "Azure Subscription: $AzureSubscriptionId"
if ($DeployTarget -eq "container-app") {
  Write-Info "Container Registry: $ContainerRegistryName"
  Write-Info "Container Env:      $ContainerAppEnvironmentName"
}
Write-Info "Tenant ID:          $TenantId"
Write-Info "Client App:         $(if ($AutoCreateEntraApp -and [string]::IsNullOrWhiteSpace($ClientId)) { 'will reuse existing or create new' } else { $ClientId })"
Write-Info "Provision Graph:    $Provision"
Write-Info "Initial crawl:      $Crawl"

if ($PlanOnly) {
  Write-Warn "PlanOnly specified. Exiting before Azure changes, build, or publish."
  return
}

Write-Step "1/8" "Checking Prerequisites"
$requiredTools = @("az", "node", "npm")
if ($DeployTarget -eq "azure-functions") { $requiredTools += "func" }
foreach ($tool in $requiredTools) {
  if (-not (Test-Command $tool)) { throw "Required tool '$tool' not found on PATH." }
  Write-Ok "$tool found"
}
$nodeMajor = [int](((node --version) -replace 'v', '').Split('.')[0])
if ($nodeMajor -lt 20) { throw "Node.js 20+ is required." }

Write-Step "2/8" "Azure Authentication"
$account = Invoke-AzJson -Arguments @("account", "show") -AllowFailure
if ([string]::IsNullOrWhiteSpace($AzureTenantId)) { throw "Azure tenant ID is required for deployment." }
if ([string]::IsNullOrWhiteSpace($AzureSubscriptionId)) { throw "Azure subscription ID or name is required for deployment." }

if ($null -eq $account -or $LASTEXITCODE -ne 0 -or $account.tenantId -ne $AzureTenantId) {
  Write-Info "Opening browser for Azure login to tenant $AzureTenantId..."
  Invoke-AzCmd -Arguments @("login", "--tenant", $AzureTenantId) | Out-Null
  $account = Invoke-AzJson -Arguments @("account", "show")
}
Invoke-AzCmd -Arguments @("account", "set", "--subscription", $AzureSubscriptionId) | Out-Null
$account = Invoke-AzJson -Arguments @("account", "show", "--subscription", $AzureSubscriptionId)
if ($account.tenantId -ne $AzureTenantId) { throw "Azure CLI is set to tenant $($account.tenantId), expected $AzureTenantId." }
Write-Ok "Azure account: $($account.user.name)"
Write-Info "Subscription: $($account.name) ($($account.id))"

Write-Step "3/8" "Provisioning Azure Resources"
Register-ResourceProvider -Namespace "Microsoft.Storage"
Register-ResourceProvider -Namespace "Microsoft.Web"
if ($DeployTarget -eq "container-app") {
  Register-ResourceProvider -Namespace "Microsoft.App"
  Register-ResourceProvider -Namespace "Microsoft.ContainerRegistry"
  Register-ResourceProvider -Namespace "Microsoft.OperationalInsights"
  Select-ContainerAppEnvironmentFromSubscription
}

$existing = Invoke-AzJson -Arguments @("group", "show", "--name", $ResourceGroupName) -AllowFailure
if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
  Invoke-AzCmd -Arguments @("group", "create", "--name", $ResourceGroupName, "--location", $Location) | Out-Null
  Write-Ok "Created resource group: $ResourceGroupName"
} else {
  Confirm-UseExistingResource -ResourceType "Resource group" -Name $ResourceGroupName
  Write-Ok "Using existing resource group: $ResourceGroupName"
}

$existing = Invoke-AzJson -Arguments @("storage", "account", "show", "--name", $StorageAccountName, "--resource-group", $ResourceGroupName) -AllowFailure
if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
  Invoke-AzCmd -Arguments @("storage", "account", "create", "--name", $StorageAccountName, "--resource-group", $ResourceGroupName, "--location", $Location, "--sku", "Standard_LRS", "--kind", "StorageV2") | Out-Null
  Write-Ok "Created storage account: $StorageAccountName"
} else {
  Confirm-UseExistingResource -ResourceType "Storage account" -Name $StorageAccountName
  Write-Ok "Using existing storage account: $StorageAccountName"
}

if ($DeployTarget -eq "container-app") {
  $existing = Invoke-AzJson -Arguments @("acr", "show", "--name", $ContainerRegistryName, "--resource-group", $ResourceGroupName) -AllowFailure
  if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
    Invoke-AzCmd -Arguments @("acr", "create", "--name", $ContainerRegistryName, "--resource-group", $ResourceGroupName, "--location", $Location, "--sku", "Basic", "--admin-enabled", "true") | Out-Null
    Write-Ok "Created ACR: $ContainerRegistryName"
  } else {
    Confirm-UseExistingResource -ResourceType "Azure Container Registry" -Name $ContainerRegistryName
    Write-Ok "Using existing ACR: $ContainerRegistryName"
  }

  $existing = Invoke-AzJson -Arguments @("containerapp", "env", "show", "--name", $ContainerAppEnvironmentName, "--resource-group", $ResourceGroupName) -AllowFailure
  if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
    Invoke-AzCmd -Arguments @("containerapp", "env", "create", "--name", $ContainerAppEnvironmentName, "--resource-group", $ResourceGroupName, "--location", $Location) | Out-Null
    Write-Ok "Created Container Apps environment: $ContainerAppEnvironmentName"
  } else {
    if (-not $SelectedContainerAppEnvironmentFromSubscription) {
      Confirm-UseExistingResource -ResourceType "Container Apps environment" -Name $ContainerAppEnvironmentName
    }
    Write-Ok "Using existing Container Apps environment: $ContainerAppEnvironmentName"
  }

  $existing = Invoke-AzJson -Arguments @("functionapp", "show", "--name", $FunctionAppName, "--resource-group", $ResourceGroupName) -AllowFailure
  if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
    Invoke-AzCmd -Arguments @("functionapp", "create", "--name", $FunctionAppName, "--resource-group", $ResourceGroupName, "--storage-account", $StorageAccountName, "--environment", $ContainerAppEnvironmentName, "--runtime", "node", "--runtime-version", "20", "--functions-version", "4", "--workload-profile-name", "Consumption", "--cpu", $ContainerCpu, "--memory", $ContainerMemory) | Out-Null
    Write-Ok "Created Function App on Container Apps: $FunctionAppName"
  } else {
    Confirm-UseExistingResource -ResourceType "Function App" -Name $FunctionAppName
    Write-Ok "Using existing Function App: $FunctionAppName"
  }
} else {
  $existing = Invoke-AzJson -Arguments @("functionapp", "plan", "show", "--name", $AppServicePlanName, "--resource-group", $ResourceGroupName) -AllowFailure
  if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
    Invoke-AzCmd -Arguments @("functionapp", "plan", "create", "--name", $AppServicePlanName, "--resource-group", $ResourceGroupName, "--location", $Location, "--sku", $PlanSku, "--is-linux", "true") | Out-Null
    Write-Ok "Created App Service Plan: $AppServicePlanName"
  } else {
    Confirm-UseExistingResource -ResourceType "App Service Plan" -Name $AppServicePlanName
    Write-Ok "Using existing App Service Plan: $AppServicePlanName"
  }

  $existing = Invoke-AzJson -Arguments @("functionapp", "show", "--name", $FunctionAppName, "--resource-group", $ResourceGroupName) -AllowFailure
  if ($null -eq $existing -or $LASTEXITCODE -ne 0) {
    Invoke-AzCmd -Arguments @("functionapp", "create", "--name", $FunctionAppName, "--resource-group", $ResourceGroupName, "--plan", $AppServicePlanName, "--storage-account", $StorageAccountName, "--runtime", "node", "--runtime-version", "20", "--functions-version", "4", "--os-type", "Linux") | Out-Null
    Write-Ok "Created Function App: $FunctionAppName"
  } else {
    Confirm-UseExistingResource -ResourceType "Function App" -Name $FunctionAppName
    Write-Ok "Using existing Function App: $FunctionAppName"
  }
}

Write-Step "4/8" "Configuring Entra ID Application"
Ensure-TenantLogin -TargetTenantId $TenantId -Purpose "Microsoft 365 app registration"

$displayName = "$connectorName Copilot Connector"
$appWasCreatedOrReusedByScript = $false

if ([string]::IsNullOrWhiteSpace($ClientId)) {
  if (-not $AutoCreateEntraApp) {
    throw "Client ID is required when automatic Entra app registration creation is disabled."
  }

  $matchingApps = @(Get-EntraAppByDisplayName -DisplayName $displayName)
  if ($matchingApps.Count -gt 0) {
    $existingApp = $matchingApps[0]
    $ClientId = $existingApp.appId
    $appWasCreatedOrReusedByScript = $true
    Write-Ok "Using existing Entra app registration: $ClientId"
  }

  if ([string]::IsNullOrWhiteSpace($ClientId)) {
    $app = Invoke-AzJson -Arguments @("ad", "app", "create", "--display-name", $displayName, "--sign-in-audience", "AzureADMyOrg")
    $ClientId = $app.appId
    $appWasCreatedOrReusedByScript = $true
    Write-Ok "Created Entra app registration: $ClientId"
  }
} else {
  $app = Get-EntraAppByAppId -AppId $ClientId
  if ($null -eq $app -or $LASTEXITCODE -ne 0) {
    throw "Entra app registration '$ClientId' was not found in tenant '$TenantId'. Re-run with an existing app ID or enable automatic app creation."
  }
  Write-Ok "Using Entra app registration: $ClientId"
}

Invoke-AzCmd -Arguments @("ad", "sp", "create", "--id", $ClientId) -AllowFailure | Out-Null
if ([string]::IsNullOrWhiteSpace($ClientSecret) -and $appWasCreatedOrReusedByScript) {
  $secret = Invoke-AzJson -Arguments @("ad", "app", "credential", "reset", "--id", $ClientId, "--display-name", "NGO Connector Deployment", "--years", "2")
  $ClientSecret = $secret.password
  Write-Ok "Created client secret for Entra app"
}
if ($SetAppSettings -and [string]::IsNullOrWhiteSpace($ClientSecret)) {
  throw "Client secret is required to configure Function App settings. Provide -ClientSecret or allow the script to create a new secret."
}

Add-GraphPermissions -AppId $ClientId
Grant-GraphAdminConsent -AppId $ClientId

Invoke-AzCmd -Arguments @("account", "set", "--subscription", $AzureSubscriptionId) | Out-Null

Write-Step "5/8" "Configuring Function App Settings"
if ($SetAppSettings) {
  $settings = @{
    "FUNCTIONS_WORKER_RUNTIME" = "node"
    "TENANT_ID" = $TenantId
    "CLIENT_ID" = $ClientId
    "CLIENT_SECRET" = $ClientSecret
    "CONNECTOR_STATE_PATH" = $ConnectorStatePath
  }
  if (-not [string]::IsNullOrWhiteSpace($PlatformUrl)) {
    $settings["PLATFORM_URL"] = $PlatformUrl
    $settings["PLATFORM_TENANT_ID"] = $PlatformTenantId
    if (-not [string]::IsNullOrWhiteSpace($RegistrySharedSecret)) {
      $settings["REGISTRY_SHARED_SECRET"] = $RegistrySharedSecret
    }
  }
  foreach ($setting in $AdditionalAppSetting) {
    $idx = $setting.IndexOf("=")
    if ($idx -le 0) { throw "Additional setting must be KEY=VALUE: $setting" }
    $settings[$setting.Substring(0, $idx)] = $setting.Substring($idx + 1)
  }
  Set-FunctionAppSettings -AppName $FunctionAppName -ResourceGroup $ResourceGroupName -Settings $settings
  Write-Ok "Application settings configured"
} else {
  Write-Warn "Skipping app settings. Use -SetAppSettings or answer yes interactively to configure them."
}

Write-Step "6/8" "Building Connector"
Push-Location $resolvedConnectorPath
try {
  if (-not $SkipRestore) {
    if (Test-Path -LiteralPath "package-lock.json") {
      Invoke-External -Command "npm" -CommandArguments @("ci")
    } else {
      Invoke-External -Command "npm" -CommandArguments @("install")
    }
  }
  if (-not $SkipBuild) { Invoke-External -Command "npm" -CommandArguments @("run", "build") }

  Write-Step "7/8" "Deploying Connector"
  if (-not $SkipPublish) {
    if ($DeployTarget -eq "container-app") {
      $acrLoginServer = "$ContainerRegistryName.azurecr.io"
      $imageName = "$acrLoginServer/${FunctionAppName}:latest"
      if (-not (Test-Path -LiteralPath "Dockerfile")) { throw "Dockerfile not found in $resolvedConnectorPath" }
      Invoke-AzCmd -Arguments @("acr", "build", "--registry", $ContainerRegistryName, "--resource-group", $ResourceGroupName, "--image", "${FunctionAppName}:latest", "--file", "Dockerfile", ".") | Out-Null
      $identity = Invoke-AzJson -Arguments @("functionapp", "identity", "assign", "--name", $FunctionAppName, "--resource-group", $ResourceGroupName)
      $acr = Invoke-AzJson -Arguments @("acr", "show", "--name", $ContainerRegistryName, "--resource-group", $ResourceGroupName)
      Invoke-AzCmd -Arguments @("role", "assignment", "create", "--role", "AcrPull", "--assignee-object-id", $identity.principalId, "--assignee-principal-type", "ServicePrincipal", "--scope", $acr.id) -AllowFailure | Out-Null
      Invoke-AzCmd -Arguments @("functionapp", "config", "container", "set", "--name", $FunctionAppName, "--resource-group", $ResourceGroupName, "--image", $imageName, "--registry-server", $acrLoginServer) | Out-Null
      Write-Ok "Container image deployed: $imageName"
    } else {
      Invoke-External -Command "func" -CommandArguments @("azure", "functionapp", "publish", $FunctionAppName)
      Write-Ok "Function App package published"
    }
  } else {
    Write-Warn "Skipping publish"
  }
} finally {
  Pop-Location
}

if ($Provision) {
  Invoke-GraphConnectorProvision -CompiledConnectorPath $resolvedConnectorPath
} else {
  Write-Step "8/9" "Provisioning Graph External Connection"
  Write-Warn "Graph connector provisioning was skipped. The connector will not appear in the Microsoft 365 admin portal until Graph provisioning runs or you invoke /api/provision manually."
}

Write-Step "9/9" "Initial Crawl"
$baseUrl = Get-FunctionBaseUrl -AppName $FunctionAppName -ResourceGroup $ResourceGroupName
if ($Crawl -and [string]::IsNullOrWhiteSpace($FunctionKey)) {
  $FunctionKey = Get-FunctionHostKey -AppName $FunctionAppName -ResourceGroup $ResourceGroupName
}
$crawlQuery = if ([string]::IsNullOrWhiteSpace($FunctionKey)) {
  "?force=true"
} else {
  "?code=$([Uri]::EscapeDataString($FunctionKey))&force=true"
}
if ($Crawl) {
  Invoke-FunctionPostWithRetry -Uri "$baseUrl/onDemandCrawl$crawlQuery" -TimeoutSec 3600 | ConvertTo-Json -Depth 10
  Write-Ok "onDemandCrawl endpoint invoked"
} else {
  Write-Warn "Initial crawl skipped. Rerun with -Crawl or invoke /api/onDemandCrawl when ready."
}

Write-Host ""
Write-Host "  Deployment complete" -ForegroundColor Green
Write-Info "Connector:      $connectorName"
Write-Info "Target:         $DeployTarget"
Write-Info "Function App:   $FunctionAppName"
Write-Info "Base API URL:   $baseUrl"
Write-Host ""
