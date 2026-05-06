<#
.SYNOPSIS
  Deploys NGO declarative agent app packages to a Microsoft 365 tenant via Microsoft Graph PowerShell.

.DESCRIPTION
  Uploads each .zip package in agent-packages/ to the tenant app catalog. Existing apps
  (matched by external app id) are updated; new apps are created.

  Uses the Microsoft.Graph PowerShell module (Connect-MgGraph) which is preauthorized for
  AppCatalog.ReadWrite.All consent, unlike the az CLI which hits a first-party-to-first-party
  preauthorization block.

  Requires the signed-in user to be a Global Admin or Teams Admin.
#>

[CmdletBinding()]
param(
  [string]$PackagesDir = "",
  [string[]]$ConnectorName = @(),
  [string]$Tenant = "",
  [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PackagesDir)) {
  $PackagesDir = Join-Path $PSScriptRoot "agent-packages"
}

if (-not (Test-Path -LiteralPath $PackagesDir)) {
  throw "Packages directory not found: $PackagesDir. Run build-agent-packages.ps1 first."
}

# Ensure Microsoft.Graph modules are available
foreach ($module in @("Microsoft.Graph.Authentication", "Microsoft.Graph.Teams")) {
  if (-not (Get-Module -ListAvailable -Name $module)) {
    Write-Host "Installing $module..." -ForegroundColor Yellow
    Install-Module -Name $module -Scope CurrentUser -Force -AllowClobber | Out-Null
  }
  Import-Module $module -ErrorAction Stop
}

function Get-ManifestId {
  param([string]$ZipPath)
  Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
  $stream = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $entry = $stream.GetEntry("manifest.json")
    if ($null -eq $entry) { throw "manifest.json not found in $ZipPath" }
    $reader = New-Object System.IO.StreamReader($entry.Open())
    try {
      $json = $reader.ReadToEnd() | ConvertFrom-Json
      return [string]$json.id
    } finally { $reader.Dispose() }
  } finally { $stream.Dispose() }
}

function Find-ExistingApp {
  param([string]$ManifestId)
  try {
    $resp = Invoke-MgGraphRequest -Method GET -Uri "/v1.0/appCatalogs/teamsApps?`$filter=externalId eq '$ManifestId'" -ErrorAction Stop
    if ($null -eq $resp) { return $null }
    $items = $null
    if ($resp -is [System.Collections.IDictionary]) {
      if ($resp.Contains("value")) { $items = $resp["value"] }
    } else {
      $vp = $resp.PSObject.Properties["value"]
      if ($null -ne $vp) { $items = $vp.Value }
    }
    if ($null -ne $items -and @($items).Count -gt 0) {
      return @($items)[0]
    }
  } catch {
    Write-Verbose "Lookup failed: $($_.Exception.Message)"
  }
  return $null
}

function Get-DictValue {
  param($obj, [string]$key)
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IDictionary]) {
    if ($obj.Contains($key)) { return $obj[$key] }
    return $null
  }
  $p = $obj.PSObject.Properties[$key]
  if ($null -ne $p) { return $p.Value }
  return $null
}

function Publish-Package {
  param([string]$ZipPath, [string]$ManifestId)

  $existing = Find-ExistingApp -ManifestId $ManifestId

  if ($null -ne $existing) {
    $teamsAppId = Get-DictValue -obj $existing -key "id"
    $uri = "/v1.0/appCatalogs/teamsApps/$teamsAppId/appDefinitions"
    Write-Host "  Updating existing app (teamsAppId=$teamsAppId)..." -ForegroundColor Gray
  } else {
    $uri = "/v1.0/appCatalogs/teamsApps"
    Write-Host "  Creating new app..." -ForegroundColor Gray
  }

  return Invoke-MgGraphRequest -Method POST -Uri $uri -InputFilePath $ZipPath -ContentType "application/zip" -ErrorAction Stop
}

function Show-ManualUploadInstructions {
  param([string]$PackagesDir)
  Write-Host ""
  Write-Host "=== Manual Upload Required ===" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "  Upload each .zip manually via the Microsoft 365 admin center:" -ForegroundColor White
  Write-Host "    1. Go to: https://admin.microsoft.com/AdminPortal/Home#/Settings/IntegratedApps" -ForegroundColor Cyan
  Write-Host "    2. Click 'Upload custom apps'" -ForegroundColor Cyan
  Write-Host "    3. Choose 'Upload manifest file (.zip)' and select each package below:" -ForegroundColor Cyan
  Write-Host ""
  Get-ChildItem -Path $PackagesDir -Filter "*.zip" | Sort-Object Name | ForEach-Object {
    Write-Host "       $($_.FullName)" -ForegroundColor Gray
  }
  Write-Host ""
}

# Connect to Microsoft Graph
Write-Host "Connecting to Microsoft Graph (AppCatalog.ReadWrite.All)..." -ForegroundColor Cyan

$connected = $false
try {
  $context = Get-MgContext -ErrorAction SilentlyContinue
  if ($null -ne $context -and $context.Scopes -contains "AppCatalog.ReadWrite.All" -and
      ([string]::IsNullOrWhiteSpace($Tenant) -or $context.TenantId -eq $Tenant)) {
    Write-Host "  OK Already connected as $($context.Account)" -ForegroundColor Green
    $connected = $true
  }
} catch {}

if (-not $connected) {
  if ($NonInteractive) {
    Write-Host "  Not connected with AppCatalog.ReadWrite.All scope." -ForegroundColor Yellow
    Show-ManualUploadInstructions -PackagesDir $PackagesDir
    exit 1
  }

  $connectArgs = @{
    Scopes = @("AppCatalog.ReadWrite.All")
    NoWelcome = $true
  }
  if (-not [string]::IsNullOrWhiteSpace($Tenant)) {
    $connectArgs.TenantId = $Tenant
  }
  # Try interactive browser first; fall back to device code if it fails
  try {
    Connect-MgGraph @connectArgs -ErrorAction Stop
  } catch {
    Write-Host "  Browser auth failed, falling back to device code..." -ForegroundColor Yellow
    $connectArgs.UseDeviceCode = $true
    Connect-MgGraph @connectArgs
  }
  $context = Get-MgContext
  if ($null -eq $context) {
    Show-ManualUploadInstructions -PackagesDir $PackagesDir
    exit 1
  }
  Write-Host "  OK Connected as $($context.Account)" -ForegroundColor Green
}

# Discover packages
$zips = Get-ChildItem -Path $PackagesDir -Filter "*.zip" | Sort-Object Name
if ($ConnectorName.Count -gt 0) {
  $zips = $zips | Where-Object {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
    $ConnectorName -contains $base
  }
}

if (@($zips).Count -eq 0) {
  throw "No packages found to deploy."
}

Write-Host ""
Write-Host "Deploying $(@($zips).Count) declarative agent package(s)..." -ForegroundColor Cyan

$results = @()
foreach ($zip in $zips) {
  $base = [System.IO.Path]::GetFileNameWithoutExtension($zip.Name)
  Write-Host "$base..." -ForegroundColor White
  try {
    $manifestId = Get-ManifestId -ZipPath $zip.FullName
    $resp = Publish-Package -ZipPath $zip.FullName -ManifestId $manifestId

    $teamsAppId = "(unknown)"
    $publishingState = "(unknown)"
    if ($null -ne $resp) {
      $idVal = Get-DictValue -obj $resp -key "id"
      if ($null -ne $idVal) { $teamsAppId = [string]$idVal }
      $stateVal = Get-DictValue -obj $resp -key "publishingState"
      if ($null -ne $stateVal) { $publishingState = [string]$stateVal }
      $taVal = Get-DictValue -obj $resp -key "teamsAppId"
      if ($null -ne $taVal) { $teamsAppId = [string]$taVal }
    }

    Write-Host "  OK teamsAppId=$teamsAppId state=$publishingState" -ForegroundColor Green
    $results += [pscustomobject]@{
      Connector = $base
      ManifestId = $manifestId
      TeamsAppId = $teamsAppId
      PublishingState = $publishingState
      Status = "OK"
    }
  } catch {
    $msg = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }

    # Treat "version already exists" 409 conflict as success — the app is deployed
    if ($msg -match "TenantAppDefinitionManifestVersionAlreadyExists" -or
        $msg -match "manifest version exists" -or
        $msg -match "exist app version") {
      Write-Host "  OK (already deployed at this version)" -ForegroundColor Green
      $results += [pscustomobject]@{
        Connector = $base
        ManifestId = ""
        TeamsAppId = ""
        PublishingState = ""
        Status = "OK"
      }
    } else {
      # Trim long HTTP error messages
      $shortMsg = if ($msg.Length -gt 200) { $msg.Substring(0, 200) + "..." } else { $msg }
      Write-Host "  FAILED: $shortMsg" -ForegroundColor Red
      $results += [pscustomobject]@{
        Connector = $base
        ManifestId = ""
        TeamsAppId = ""
        PublishingState = ""
        Status = "FAILED: $shortMsg"
      }
    }
  }
}

Write-Host ""
Write-Host "=== Deployment Summary ===" -ForegroundColor Cyan
foreach ($r in $results) {
  $color = if ($r.Status -eq "OK") { "Green" } else { "Red" }
  Write-Host ("  {0} : {1}" -f $r.Connector, $r.Status) -ForegroundColor $color
}

$ok = @($results | Where-Object { $_.Status -eq "OK" }).Count
$failed = @($results).Count - $ok
Write-Host ""
Write-Host "Succeeded: $ok  Failed: $failed" -ForegroundColor Cyan

if ($ok -gt 0) {
  Write-Host ""
  Write-Host "Next steps:" -ForegroundColor Yellow
  Write-Host "  1. Open https://admin.microsoft.com/AdminPortal/Home#/Settings/IntegratedApps"
  Write-Host "  2. Find each NGO agent and click 'Deploy' to assign it to users"
  Write-Host "  3. The agents will appear in Microsoft 365 Copilot Chat once deployed"
}
