# Push company Flutterwave secrets (boss / eFintax keys) to production.
# Prereq: npx supabase login  (account that owns dkdnwumllibwdlqbjkwy)
#
#   .\supabase\scripts\Push-Flutterwave-Secrets.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "dkdnwumllibwdlqbjkwy"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$secretsFile = Join-Path $Root "migration-export\secrets.env"

if (-not (Test-Path $secretsFile)) {
  Write-Host "Missing $secretsFile" -ForegroundColor Red
  exit 1
}

$wanted = @(
  "FLW_CLIENT_ID",
  "FLW_CLIENT_SECRET",
  "FLW_PUBLIC_KEY",
  "FLW_SECRET_KEY",
  "FLW_ENCRYPTION_KEY",
  "FLW_V4_ENCRYPTION_KEY",
  "FLW_WEBHOOK_HASH",
  "FLW_PROXY_URL",
  "FLW_V4_PROXY_URL",
  "FLW_V4_ENV"
)

$map = @{}
Get-Content $secretsFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $i = $line.IndexOf("=")
  if ($i -lt 1) { return }
  $k = $line.Substring(0, $i).Trim()
  $v = $line.Substring($i + 1).Trim()
  if ($wanted -contains $k -and $v) { $map[$k] = $v }
}

# Defaults if not in file
if (-not $map.ContainsKey("FLW_V4_ENV")) { $map["FLW_V4_ENV"] = "live" }

$missing = $wanted | Where-Object {
  $_ -notin @("FLW_V4_ENV", "FLW_V4_ENCRYPTION_KEY") -and -not $map.ContainsKey($_)
}
if ($missing.Count -gt 0) {
  Write-Host "Missing in secrets.env: $($missing -join ', ')" -ForegroundColor Red
  exit 1
}

Write-Host "=== Push Flutterwave secrets ($ProjectRef) ===" -ForegroundColor Cyan
Write-Host "  PUBLIC_KEY = $($map['FLW_PUBLIC_KEY'])"
Write-Host "  CLIENT_ID  = $($map['FLW_CLIENT_ID'])"
Write-Host "  SECRET_KEY = $($map['FLW_SECRET_KEY'].Substring(0, [Math]::Min(18, $map['FLW_SECRET_KEY'].Length)))..."

$pairs = @()
foreach ($k in $wanted) {
  if ($map.ContainsKey($k)) { $pairs += "$k=$($map[$k])" }
}

npx supabase secrets set --project-ref $ProjectRef @pairs
if ($LASTEXITCODE -ne 0) {
  Write-Host "secrets set failed (403 = wrong Supabase account / role)." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Flutterwave secrets pushed OK." -ForegroundColor Green
Write-Host "Postman: import postman/Company-Flutterwave-eFinTax.postman_environment.local.json" -ForegroundColor Cyan
Write-Host "Then run: 0. Auth -> Get V4 access token" -ForegroundColor Cyan
