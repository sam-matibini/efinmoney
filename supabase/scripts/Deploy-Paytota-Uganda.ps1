# Apply Paytota Africa ledger accounts + deploy Uganda payin/payout functions.
# Prereq: npx supabase login (eFin owner)
#
#   .\supabase\scripts\Deploy-Paytota-Uganda.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "dkdnwumllibwdlqbjkwy"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

Write-Host "=== Paytota Uganda deploy ($ProjectRef) ===" -ForegroundColor Cyan

$envFile = Join-Path $Root "scripts\.paytota.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    if ($k -and $v -and -not [Environment]::GetEnvironmentVariable($k)) {
      [Environment]::SetEnvironmentVariable($k, $v, "Process")
    }
  }
}

$secret = $env:PAYTOTA_SECRET_KEY
$brand = $env:PAYTOTA_BRAND_ID
if (-not $secret -or -not $brand) {
  Write-Host "Missing PAYTOTA_SECRET_KEY / PAYTOTA_BRAND_ID (scripts\.paytota.env)" -ForegroundColor Red
  exit 1
}

Write-Host "Pushing Paytota secrets..." -ForegroundColor Yellow
npx supabase secrets set --project-ref $ProjectRef `
  "PAYTOTA_SECRET_KEY=$secret" `
  "PAYTOTA_BRAND_ID=$brand" `
  PAYTOTA_BASE_URL=https://gate.paytota.com `
  PAYTOTA_PAYOUT_ENABLED=true
if ($LASTEXITCODE -ne 0) { throw "secrets set failed" }

Write-Host "Applying Africa settlement ledger accounts..." -ForegroundColor Yellow
npx supabase db query --linked -f supabase/migrations/20260724180000_paytota_africa_settlement.sql --yes
if ($LASTEXITCODE -ne 0) {
  Write-Host "db query failed - run the SQL manually in Supabase SQL editor if needed." -ForegroundColor Yellow
}

$fns = @("paytota-collection", "paytota-webhook", "paytota-payout", "execute-transfer")
$failed = @()
foreach ($fn in $fns) {
  Write-Host "  -> $fn" -ForegroundColor DarkCyan
  npx supabase functions deploy $fn --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { $failed += $fn }
}

if ($failed.Count -gt 0) {
  Write-Host "Failed: $($failed -join ', ')" -ForegroundColor Red
  Write-Host "If 403: npx supabase login with eFin owner account" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Paytota Uganda deploy OK." -ForegroundColor Green
Write-Host "App test:" -ForegroundColor Cyan
Write-Host "  PAYIN:  Top Up -> UGX wallet -> MoMo checkout -> phone 256... -> approve STK"
Write-Host "  PAYOUT: Send -> Uganda/UGX MoMo -> enable Alternate MoMo payout (test)"
Write-Host ""
