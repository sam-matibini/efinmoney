# Check if Lenhub/Flutterwave hit our webhook recently.
# Prereq: npx supabase login (eFin owner account)
#
#   .\supabase\scripts\Check-Lenhub-Webhooks.ps1

$ErrorActionPreference = "Stop"

$sqlCharges = "select charge_id, amount, currency_code, status, credited_at, created_at from public.lenhub_flutter_charges where created_at > now() - interval '6 hours' order by created_at desc limit 15;"
$sqlHooks = "select event, processed, received_at, left(payload::text, 500) as payload_preview from public.flw_webhook_logs where received_at > now() - interval '3 hours' order by received_at desc limit 20;"

Write-Host "=== Recent lenhub_flutter_charges (6h) ===" -ForegroundColor Cyan
npx supabase db query --linked --experimental $sqlCharges

Write-Host ""
Write-Host "=== Recent flw_webhook_logs (3h) ===" -ForegroundColor Cyan
npx supabase db query --linked --experimental $sqlHooks

Write-Host ""
Write-Host "Look for event=lenhub_flutter with amount/account/reference in payload." -ForegroundColor Yellow
