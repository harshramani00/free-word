# Installs or updates Quill Cloud on a Windows machine.
#
#   .\deploy.ps1                      # download the latest release bundle and (re)start the service
#   .\deploy.ps1 -Version v0.2.0      # a specific release
#   .\deploy.ps1 -FromSource          # build server.mjs from this checkout instead of downloading
#
# Run from an elevated PowerShell the first time (service install). Later runs only need
# rights to write C:\quill-cloud and restart the service.

[CmdletBinding()]
param(
  [string]$Version = 'latest',
  [switch]$FromSource,
  [string]$Repo = 'harshramani00/quill',
  [string]$InstallDir = 'C:\quill-cloud',
  [string]$DataDir = 'C:\quill-data'
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $InstallDir, $DataDir | Out-Null

if ($FromSource) {
  $root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
  Write-Host "Building server.mjs from $root"
  Push-Location $root
  try {
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
    npm ci --no-audit --no-fund
    npm run build -w server
    Copy-Item (Join-Path $root 'server\dist\server.mjs') (Join-Path $InstallDir 'server.mjs') -Force
  } finally {
    Pop-Location
  }
} else {
  $url = if ($Version -eq 'latest') { "https://github.com/$Repo/releases/latest/download/quill-cloud-server.mjs" } else { "https://github.com/$Repo/releases/download/$Version/quill-cloud-server.mjs" }
  Write-Host "Downloading $url"
  Invoke-WebRequest -Uri $url -OutFile (Join-Path $InstallDir 'server.mjs') -UseBasicParsing
}

$envFile = Join-Path $InstallDir '.env'
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $PSScriptRoot '..\.env.example') $envFile
  Write-Host "Created $envFile — fill in ISSUER, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before starting." -ForegroundColor Yellow
}

$winsw = Join-Path $InstallDir 'quill-cloud.exe'
if (-not (Test-Path $winsw)) {
  Write-Host 'Downloading WinSW (service wrapper)'
  Invoke-WebRequest -Uri 'https://github.com/winsw/winsw/releases/latest/download/WinSW-x64.exe' -OutFile $winsw -UseBasicParsing
  Copy-Item (Join-Path $PSScriptRoot 'quill-cloud.xml') (Join-Path $InstallDir 'quill-cloud.xml') -Force
  & $winsw install
  Write-Host 'Service installed. Start it with: quill-cloud.exe start' -ForegroundColor Green
} else {
  & $winsw restart
  Write-Host 'Service restarted.' -ForegroundColor Green
}
