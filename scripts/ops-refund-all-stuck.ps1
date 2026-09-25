# Run as eFintax owner. Shows Alice details + refunds all stuck transfers.
$ErrorActionPreference = "Stop"
$ref = "dkdnwumllibwdlqbjkwy"

Write-Host "=== Confirm eFintax ==="
npx supabase projects list -o pretty 2>&1 | Select-String -Pattern "dkdn|eFintax"
npx supabase link --project-ref $ref | Out-Null

Write-Host "=== Alice + bulk refund ==="
npx supabase db query --linked --yes -f "scripts/ops-refund-stuck-fresh-start.sql"

Write-Host "DONE - Alice details are in the first result set above."
