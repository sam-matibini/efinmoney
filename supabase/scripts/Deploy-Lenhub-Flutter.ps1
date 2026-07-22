# Deploy only Lenhub Flutter edge functions to production.
# Prerequisites:
#   1. npx supabase login   (use the eFintax / project OWNER account)
#   2. Confirm you can see project dkdnwumllibwdlqbjkwy in: npx supabase projects list
#
# Usage (from repo root):
#   .\supabase\scripts\Deploy-Lenhub-Flutter.ps1

$ErrorActionPreference = "Stop"
$ProjectRef = "dkdnwumllibwdlqbjkwy"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

Write-Host ""
Write-Host "=== Deploy Lenhub Flutter ($ProjectRef) ===" -ForegroundColor Cyan
Write-Host ""

$fns = @(
  "lenhub-flutter",
  "lenhub-flutter-payout",
  "lenhub-flutter-webhook",
  "execute-transfer"
)

$failed = @()
foreach ($fn in $fns) {
  Write-Host "  -> $fn" -ForegroundColor DarkCyan
  try {
    npx supabase functions deploy $fn --project-ref $ProjectRef
    if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
  } catch {
    Write-Host "  FAILED: $fn - $_" -ForegroundColor Red
    $failed += $fn
  }
}

# Ensure rail flags are on (idempotent)
Write-Host ""
Write-Host "Setting LENHUB_FLUTTER_* secrets..." -ForegroundColor Yellow
npx supabase secrets set --project-ref $ProjectRef `
  LENHUB_FLUTTER_API_URL=https://mtn.lenhub.net `
  LENHUB_FLUTTER_ENABLED=true `
  LENHUB_FLUTTER_PAYOUT=true

if ($failed.Count -gt 0) {
  Write-Host ""
  Write-Host "Incomplete. Failed: $($failed -join ', ')" -ForegroundColor Red
  Write-Host "If 403: you are on the wrong Supabase account. Run: npx supabase login" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "Lenhub Flutter deploy OK." -ForegroundColor Green
Write-Host "Next: Top Up -> Card (direct) with a small USD/CAD amount." -ForegroundColor Cyan
Write-Host ""
