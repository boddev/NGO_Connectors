<#
.SYNOPSIS
  Builds Microsoft 365 declarative agent app packages for all NGO connectors.

.DESCRIPTION
  For each ngo-* connector, generates an M365 app package (.zip) containing:
    - manifest.json (Teams/M365 app manifest, schema 1.17)
    - declarativeAgent.json (already in connector folder)
    - color.png (192x192) and outline.png (32x32) icons
  Output: agent-packages/<connector-name>.zip

  These packages can be uploaded to:
    - Microsoft 365 admin center > Integrated apps (tenant-wide)
    - Teams admin center > Manage apps (per-user/group)
    - Or deployed via deploy-agent-packages.ps1 (Graph API)

.PARAMETER PublisherName
  Publisher display name in the manifest. Default: "NGO Connectors".

.PARAMETER PublisherWebsite
  Publisher website URL. Default: "https://github.com/boddev".

.PARAMETER OutputDir
  Where to write the .zip packages. Default: ./agent-packages
#>

[CmdletBinding()]
param(
  [string]$PublisherName = "NGO Connectors",
  [string]$PublisherWebsite = "https://github.com/boddev",
  [string]$OutputDir = "",
  [string]$Version = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $PSScriptRoot "agent-packages"
}

# Use a calendar-style version (1.YYYYMMDD.HHMM) so repeated builds are accepted
# by the M365 app catalog (which rejects re-uploads of the same version).
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = "1.{0}.{1}" -f (Get-Date -Format "yyyyMMdd"), (Get-Date -Format "HHmm")
}

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-DeterministicGuid {
  param([string]$Seed)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Seed))
    $g = New-Object byte[] 16
    [Array]::Copy($bytes, 0, $g, 0, 16)
    # Set version (4) and variant bits per RFC 4122
    $g[6] = ($g[6] -band 0x0F) -bor 0x40
    $g[8] = ($g[8] -band 0x3F) -bor 0x80
    Write-Verbose "[GUID] seed='$Seed' bytes=$($bytes[0..3] -join ',') result=$([Guid]::new($g))"
    return ([Guid]::new($g)).ToString()
  } finally {
    $sha.Dispose()
  }
}

function New-ConnectorIcon {
  param(
    [string]$Path,
    [int]$Size,
    [string]$Letter,
    [int]$Red,
    [int]$Green,
    [int]$Blue,
    [bool]$Transparent = $false
  )
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    if ($Transparent) {
      $g.Clear([System.Drawing.Color]::Transparent)
      $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, $Red, $Green, $Blue), [single](2.0))
      try {
        $inset = 2
        $g.DrawRectangle($pen, $inset, $inset, $Size - ($inset * 2) - 1, $Size - ($inset * 2) - 1)
      } finally { $pen.Dispose() }
    } else {
      $bg = [System.Drawing.Color]::FromArgb(255, $Red, $Green, $Blue)
      $g.Clear($bg)
    }

    $fontSize = [single]($Size * 0.5)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    try {
      $brushColor = if ($Transparent) {
        [System.Drawing.Color]::FromArgb(255, $Red, $Green, $Blue)
      } else {
        [System.Drawing.Color]::White
      }
      $brush = New-Object System.Drawing.SolidBrush($brushColor)
      try {
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = [System.Drawing.StringAlignment]::Center
        $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
        $rect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
        $g.DrawString($Letter, $font, $brush, $rect, $sf)
      } finally { $brush.Dispose() }
    } finally { $font.Dispose() }

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose()
    $bmp.Dispose()
  }
}

function New-ManifestJson {
  param(
    [string]$ConnectorName,
    [psobject]$DeclarativeAgent,
    [string]$AppId,
    [string]$Publisher,
    [string]$Website,
    [string]$Version
  )

  $shortName = $DeclarativeAgent.name
  if ($shortName.Length -gt 30) { $shortName = $shortName.Substring(0, 30) }
  $fullName = $DeclarativeAgent.name
  if ($fullName.Length -gt 100) { $fullName = $fullName.Substring(0, 100) }

  $shortDesc = $DeclarativeAgent.description
  if ($shortDesc.Length -gt 80) { $shortDesc = $shortDesc.Substring(0, 77) + "..." }
  $fullDesc = $DeclarativeAgent.description
  if ($fullDesc.Length -gt 4000) { $fullDesc = $fullDesc.Substring(0, 4000) }

  return @{
    "`$schema" = "https://developer.microsoft.com/json-schemas/teams/v1.19/MicrosoftTeams.schema.json"
    manifestVersion = "1.19"
    version = $Version
    id = $AppId
    developer = @{
      name = $Publisher
      websiteUrl = $Website
      privacyUrl = "$Website/blob/main/PRIVACY.md"
      termsOfUseUrl = "$Website/blob/main/TERMS.md"
    }
    icons = @{
      color = "color.png"
      outline = "outline.png"
    }
    name = @{
      short = $shortName
      full = $fullName
    }
    description = @{
      short = $shortDesc
      full = $fullDesc
    }
    accentColor = "#1f6feb"
    copilotAgents = @{
      declarativeAgents = @(
        @{
          id = ($ConnectorName -replace '-','') + "Agent"
          file = "declarativeAgent.json"
        }
      )
    }
    validDomains = @()
  }
}

# Color palette for connectors (deterministic)
$paletteColors = @(
  @{ R = 31;  G = 111; B = 235 }, # blue
  @{ R = 35;  G = 134; B = 54  }, # green
  @{ R = 218; G = 54;  B = 51  }, # red
  @{ R = 130; G = 80;  B = 223 }, # purple
  @{ R = 219; G = 109; B = 40  }, # orange
  @{ R = 28;  G = 132; B = 138 }, # teal
  @{ R = 191; G = 135; B = 0   }, # gold
  @{ R = 88;  G = 96;  B = 105 }  # gray
)

$root = $PSScriptRoot
$connectors = Get-ChildItem -Path $root -Directory -Filter "ngo-*" | Sort-Object Name

$results = @()

foreach ($connector in $connectors) {
  $name = $connector.Name
  Write-Host "Building package for $name..." -ForegroundColor Cyan

  $daPath = Join-Path $connector.FullName "declarativeAgent.json"
  if (-not (Test-Path -LiteralPath $daPath)) {
    Write-Host "  Skipping: declarativeAgent.json not found" -ForegroundColor Yellow
    continue
  }

  $da = Get-Content -LiteralPath $daPath -Raw | ConvertFrom-Json
  $appId = New-DeterministicGuid -Seed "ngo-connectors:${name}:appId:v1"

  # Pick a deterministic color
  $hash = 0
  foreach ($ch in $name.ToCharArray()) { $hash = ($hash * 31 + [int]$ch) }
  $color = $paletteColors[[Math]::Abs($hash) % $paletteColors.Count]

  # Letter for the icon — use first letter after "ngo-"
  $letter = ($name.Substring(4, 1)).ToUpper()

  # Build a temp staging directory
  $stage = Join-Path ([System.IO.Path]::GetTempPath()) "ngo-pkg-$name-$([Guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Path $stage -Force | Out-Null

  try {
    # Copy declarativeAgent.json
    Copy-Item -LiteralPath $daPath -Destination (Join-Path $stage "declarativeAgent.json") -Force

    # Generate icons
    New-ConnectorIcon -Path (Join-Path $stage "color.png") -Size 192 -Letter $letter -Red $color.R -Green $color.G -Blue $color.B -Transparent $false
    New-ConnectorIcon -Path (Join-Path $stage "outline.png") -Size 32 -Letter $letter -Red $color.R -Green $color.G -Blue $color.B -Transparent $true

    # Generate manifest.json
    $manifest = New-ManifestJson -ConnectorName $name -DeclarativeAgent $da -AppId $appId -Publisher $PublisherName -Website $PublisherWebsite -Version $Version
    $manifestJson = $manifest | ConvertTo-Json -Depth 10
    # Restore $schema (PowerShell escapes as `$schema)
    $manifestJson = $manifestJson -replace '"`\$schema"', '"$schema"'
    Set-Content -LiteralPath (Join-Path $stage "manifest.json") -Value $manifestJson -Encoding UTF8

    # Create the zip
    $zipPath = Join-Path $OutputDir "$name.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

    Write-Host "  Created: $zipPath (appId=$appId)" -ForegroundColor Green
    $results += [pscustomobject]@{
      Connector = $name
      AppId = $appId
      Package = $zipPath
      AgentName = $da.name
    }
  } finally {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# Write manifest summary
$summaryPath = Join-Path $OutputDir "packages-summary.json"
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
Write-Host ""
Write-Host "Built $($results.Count) agent packages in $OutputDir" -ForegroundColor Green
Write-Host "Summary: $summaryPath" -ForegroundColor Gray
