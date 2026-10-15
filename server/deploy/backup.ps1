# Nightly backup for Quill Cloud: a consistent copy of the database plus a mirror of the
# document blobs. Schedule it with Task Scheduler (see deploy/README.md).
#
#   .\backup.ps1 -Destination E:\quill-backup
#
# Blobs are immutable once written, so mirroring the folder is safe; the database copy is
# made with SQLite's own VACUUM INTO, which works while the service is running.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Destination,
  [string]$InstallDir = 'C:\quill-cloud',
  [string]$DataDir = 'C:\quill-data',
  [int]$KeepDays = 14
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Destination, (Join-Path $Destination 'db') | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$dbCopy = Join-Path $Destination "db\quill-$stamp.sqlite"
& 'C:\Program Files\nodejs\node.exe' --env-file=(Join-Path $InstallDir '.env') (Join-Path $InstallDir 'server.mjs') backup $dbCopy
Get-ChildItem (Join-Path $Destination 'db') -Filter 'quill-*.sqlite' | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force

robocopy (Join-Path $DataDir 'users') (Join-Path $Destination 'users') /MIR /R:2 /W:5 /NP /LOG+:(Join-Path $Destination 'robocopy.log') | Out-Null
robocopy (Join-Path $DataDir 'keys') (Join-Path $Destination 'keys') /MIR /R:2 /W:5 /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
Write-Host "Backup finished: $dbCopy and $Destination\users"
