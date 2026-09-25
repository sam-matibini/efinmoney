# Deploy remaining + retry EFM-15B15A2C (ZMW Airtel) via Fincra.
# Run while logged in as eFintax owner (projects list must show ● dkdnwumllibwdlqbjkwy).
$ErrorActionPreference = "Stop"
$ref = "dkdnwumllibwdlqbjkwy"
$tid = $null

npx supabase projects list -o pretty 2>&1 | Select-String -Pattern "dkdn|eFintax"
npx supabase link --project-ref $ref | Out-Null

npx supabase functions deploy ops-settle --project-ref $ref
npx supabase db query --linked --yes -f supabase/migrations/20260925140000_payout_fincra_nomba_only.sql

$envOut = npx supabase projects api-keys --project-ref $ref -o env 2>&1 | Out-String
if ($envOut -notmatch 'SUPABASE_SERVICE_ROLE_KEY=(.+)') { throw "Need service role key" }
$serviceKey = $Matches[1].Trim().Trim('"')

$sql = "select id, status, failure_reason, recipient_phone, payout_method, target_amount, target_currency, source_currency, recipient_name from transfers where replace(id::text, '-', '') ilike '15b15a2c%' limit 1;"
Set-Content "$env:TEMP\zmw_retry.sql" $sql -Encoding utf8
$q = npx supabase db query --linked --yes -f "$env:TEMP\zmw_retry.sql" -o json 2>&1 | Out-String
# Parse id from pretty/json loosely
if ($q -match '"id"\s*:\s*"([0-9a-f-]{36})"') { $tid = $Matches[1] }
if (-not $tid) { throw "Transfer EFM-15B15A2C not found: $q" }
Write-Host "Transfer $tid"

$headers = @{
  "Content-Type" = "application/json"
  "Authorization" = "Bearer $serviceKey"
  "apikey" = $serviceKey
  "x-internal-secret" = $serviceKey
}
$body = @{
  transfer_id = $tid
  phone_number = $null
  amount = 135.53
  currency = "ZMW"
  source_currency = "CAD"
  network = "airtel"
  recipient_name = "Alice Chikwala Matibini"
  force_retry = $true
  skip_reversal = $true
} | ConvertTo-Json

# Fill phone from DB if present in query output
if ($q -match '"recipient_phone"\s*:\s*"([^"]+)"') {
  $phone = $Matches[1]
  $bodyObj = $body | ConvertFrom-Json
  $bodyObj.phone_number = $phone
  $body = $bodyObj | ConvertTo-Json
}

$payout = Invoke-RestMethod -Method POST -Uri "https://$ref.supabase.co/functions/v1/fincra-payout" -Headers $headers -Body $body
$payout | ConvertTo-Json -Depth 6
if (-not ($payout.success -eq $true -or $payout.queued -eq $true)) {
  throw "Fincra payout failed: $($payout.error)"
}
Write-Host "DONE"
