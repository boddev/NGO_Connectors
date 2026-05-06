[CmdletBinding()]
param(
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

$arguments = @{
  ConnectorPath = $PSScriptRoot
}
if (-not [string]::IsNullOrWhiteSpace($env:RELIEFWEB_APPNAME) -and $AdditionalAppSetting -notcontains "RELIEFWEB_APPNAME=$env:RELIEFWEB_APPNAME") {
  $AdditionalAppSetting += "RELIEFWEB_APPNAME=$env:RELIEFWEB_APPNAME"
}
if (-not [string]::IsNullOrWhiteSpace($EnvFile)) { $arguments.EnvFile = $EnvFile }
if (-not [string]::IsNullOrWhiteSpace($DeployTarget)) { $arguments.DeployTarget = $DeployTarget }
if (-not [string]::IsNullOrWhiteSpace($FunctionAppName)) { $arguments.FunctionAppName = $FunctionAppName }
if (-not [string]::IsNullOrWhiteSpace($ResourceGroupName)) { $arguments.ResourceGroupName = $ResourceGroupName }
if (-not [string]::IsNullOrWhiteSpace($Location)) { $arguments.Location = $Location }
if (-not [string]::IsNullOrWhiteSpace($StorageAccountName)) { $arguments.StorageAccountName = $StorageAccountName }
if (-not [string]::IsNullOrWhiteSpace($AppServicePlanName)) { $arguments.AppServicePlanName = $AppServicePlanName }
if (-not [string]::IsNullOrWhiteSpace($PlanSku)) { $arguments.PlanSku = $PlanSku }
if (-not [string]::IsNullOrWhiteSpace($ContainerRegistryName)) { $arguments.ContainerRegistryName = $ContainerRegistryName }
if (-not [string]::IsNullOrWhiteSpace($ContainerAppEnvironmentName)) { $arguments.ContainerAppEnvironmentName = $ContainerAppEnvironmentName }
if (-not [string]::IsNullOrWhiteSpace($ContainerCpu)) { $arguments.ContainerCpu = $ContainerCpu }
if (-not [string]::IsNullOrWhiteSpace($ContainerMemory)) { $arguments.ContainerMemory = $ContainerMemory }
if (-not [string]::IsNullOrWhiteSpace($AzureTenantId)) { $arguments.AzureTenantId = $AzureTenantId }
if (-not [string]::IsNullOrWhiteSpace($AzureSubscriptionId)) { $arguments.AzureSubscriptionId = $AzureSubscriptionId }
if (-not [string]::IsNullOrWhiteSpace($TenantId)) { $arguments.TenantId = $TenantId }
if (-not [string]::IsNullOrWhiteSpace($ClientId)) { $arguments.ClientId = $ClientId }
if (-not [string]::IsNullOrWhiteSpace($ClientSecret)) { $arguments.ClientSecret = $ClientSecret }
if (-not [string]::IsNullOrWhiteSpace($ConnectorStatePath)) { $arguments.ConnectorStatePath = $ConnectorStatePath }
if (-not [string]::IsNullOrWhiteSpace($PlatformUrl)) { $arguments.PlatformUrl = $PlatformUrl }
if (-not [string]::IsNullOrWhiteSpace($PlatformTenantId)) { $arguments.PlatformTenantId = $PlatformTenantId }
if (-not [string]::IsNullOrWhiteSpace($RegistrySharedSecret)) { $arguments.RegistrySharedSecret = $RegistrySharedSecret }
if ($AdditionalAppSetting.Count -gt 0) { $arguments.AdditionalAppSetting = $AdditionalAppSetting }
if ($SetAppSettings) { $arguments.SetAppSettings = $true }
if ($SkipRestore) { $arguments.SkipRestore = $true }
if ($SkipBuild) { $arguments.SkipBuild = $true }
if ($SkipPublish) { $arguments.SkipPublish = $true }
if ($Provision) { $arguments.Provision = $true }
if ($Crawl) { $arguments.Crawl = $true }
if (-not [string]::IsNullOrWhiteSpace($FunctionKey)) { $arguments.FunctionKey = $FunctionKey }
if ($NonInteractive) { $arguments.NonInteractive = $true }
if ($AutoCreateEntraApp) { $arguments.AutoCreateEntraApp = $true }
if ($GrantAdminConsent) { $arguments.GrantAdminConsent = $true }
if ($PlanOnly) { $arguments.PlanOnly = $true }

& (Join-Path (Split-Path $PSScriptRoot -Parent) "setup\deploy-connector.ps1") @arguments

