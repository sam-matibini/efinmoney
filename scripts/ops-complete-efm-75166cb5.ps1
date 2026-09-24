# Complete EFM-75166CB5 (CAD→NGN OPay) via Fincra after owner login.
# Run from efinmoney/ as the eFintax Supabase owner account.
$ErrorActionPreference = "Stop"
$ref = "dkdnwumllibwdlqbjkwy"
$tid = "75166cb5-a5d1-4980-b5ca-9067ceba59b6"
$base = "https://$ref.supabase.co/functions/v1"

Write-Host "=== Confirm eFintax project visible ==="
npx supabase projects list -o pretty 2>&1 | Select-String -Pattern "dkdn|eFintax"
if ($LASTEXITCODE -ne 0) { throw "Not logged in / no access. Run: npx supabase login" }

Write-Host "=== Apply NGN Fincra-first policy ==="
npx supabase db query --linked --yes -f supabase/migrations/20260924180000_ngn_payout_fincra_first.sql

Write-Host "=== Deploy functions ==="
@("fincra-payout","execute-transfer","flutterwave-payout","send-email") | ForEach-Object {
  Write-Host "Deploying $_ ..."
  npx supabase functions deploy $_ --project-ref $ref
  if ($LASTEXITCODE -ne 0) { throw "Deploy failed: $_" }
}

Write-Host "=== Fetch service role key ==="
$envOut = npx supabase projects api-keys --project-ref $ref -o env 2>&1 | Out-String
if ($envOut -notmatch 'SUPABASE_SERVICE_ROLE_KEY=(.+)') { throw "Could not read service role key" }
$serviceKey = $Matches[1].Trim().Trim('"')

$headers = @{
  "Content-Type" = "application/json"
  "Authorization" = "Bearer $serviceKey"
  "apikey" = $serviceKey
  "x-internal-secret" = $serviceKey
}

Write-Host "=== Fincra payout (force_retry, prefer CAD float) ==="
$body = @{
  transfer_id = $tid
  account_number = "8068608302"
  bank_code = "100004"
  amount = 99400
  currency = "NGN"
  source_currency = "CAD"
  fincra_source_currency = "CAD"
  recipient_name = "BENEDICT OJIMA-OJO UKWENYA"
  skip_reversal = $true
  force_retry = $true
} | ConvertTo-Json
$payout = Invoke-RestMethod -Method POST -Uri "$base/fincra-payout" -Headers $headers -Body $body
$payout | ConvertTo-Json -Depth 6
if (-not ($payout.success -eq $true -or $payout.queued -eq $true)) {
  throw "Fincra payout did not succeed: $($payout.error)"
}

Write-Host "=== Apology email to sender ==="
$emailBody = @{
  type = "transfer_apology_completed"
  to = "sam@efintax.biz"
  data = @{
    recipient_name = "BENEDICT OJIMA-OJO UKWENYA"
    source_amount = "100.00"
    source_currency = "CAD"
    target_amount = "99400"
    target_currency = "NGN"
    bank_name = "OPay"
    account_number = "8068608302"
    reference = "EFM-75166CB5"
    id = $tid
  }
} | ConvertTo-Json -Depth 5
$mail = Invoke-RestMethod -Method POST -Uri "$base/send-email" -Headers $headers -Body $emailBody
$mail | ConvertTo-Json -Depth 4

Write-Host "=== DONE ==="
