# Deploy eFinMoney Supabase production (project dkdnwumllibwdlqbjkwy)
# Run from repo root with an account that OWNS the Supabase project:
#   cd efinmoney-d4767097
#   .\supabase\scripts\Deploy-Production.ps1
#
# Optional flags:
#   -SecretsOnly    Only push edge-function secrets
#   -FunctionsOnly  Only deploy updated edge functions
#   -DbOnly         Only run pending SQL migrations
#   -SkipSecrets    Skip secrets push

param(
  [switch]$SecretsOnly,
  [switch]$FunctionsOnly,
  [switch]$DbOnly,
  [switch]$SkipSecrets
)

$ErrorActionPreference = "Stop"
$ProjectRef = "dkdnwumllibwdlqbjkwy"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $Root

Write-Host ""
Write-Host "=== eFinMoney Supabase deploy ($ProjectRef) ===" -ForegroundColor Cyan
Write-Host ""

# --- Link project (ignore if already linked) ---
try {
  npx supabase link --project-ref $ProjectRef 2>&1 | Out-Null
} catch {
  Write-Warning "Could not link project - ensure you are logged in: npx supabase login"
}

function Push-Secrets {
  $secretsFile = Join-Path $Root "migration-export\secrets.env"
  if (-not (Test-Path $secretsFile)) {
    throw "Missing $secretsFile"
  }

  $pairs = @()
  Get-Content $secretsFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $eq = $line.IndexOf('=')
    if ($eq -lt 1) { return }
    $name = $line.Substring(0, $eq)
    $value = $line.Substring($eq + 1).Trim([char]34)
    if ([string]::IsNullOrWhiteSpace($value)) { return }
    # Skip reference-only keys not used by edge functions
    if ($name.EndsWith('_PRODUCTION') -or $name.EndsWith('_SANDBOX')) { return }
    $pairs += "${name}=${value}"
  }
  # Always set public app URL for staff invites
  if ($pairs -notcontains "APP_URL=https://efin.money") {
    $pairs += "APP_URL=https://efin.money"
  }

  # CARD_SECRETS_KEY encrypts virtual-card PAN/CVV - generate if missing from secrets.env
  $hasCardSecrets = $false
  foreach ($p in $pairs) {
    if ($p -like "CARD_SECRETS_KEY=*") { $hasCardSecrets = $true; break }
  }
  if (-not $hasCardSecrets) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $generatedKey = [Convert]::ToBase64String($bytes)
    $pairs += "CARD_SECRETS_KEY=$generatedKey"
    Write-Host "Generated CARD_SECRETS_KEY - add to migration-export/secrets.env to reuse on redeploy" -ForegroundColor Yellow
  }

  Write-Host "Pushing $($pairs.Count) secrets..." -ForegroundColor Yellow
  npx supabase secrets set --project-ref $ProjectRef @pairs
  Write-Host "Secrets OK" -ForegroundColor Green
  Write-Host ""
}

function Deploy-Functions {
  $critical = @(
    "stripe-payment-intent",
    "stripe-create-checkout-session",
    "stripe-save-card",
    "stripe-save-card-confirm",
    "stripe-charge-saved-card",
    "stripe-charge-card",
    "plaid-create-link-token",
    "plaid-exchange-token",
    "intra-ca-transfer-create",
    "auth-send-email",
    "admin-invite-staff",
    "admin-review-staff",
    "send-email",
    "adyen-create-session",
    "adyen-confirm-session",
    "adyen-webhook",
    "virtual-card-ops",
    "flw-get-billers",
    "flw-validate-bill",
    "flw-bill-payment",
    "elicate-payout",
    "elicate-webhook",
    "elicate-reconcile",
    "execute-transfer",
    "create-persona-inquiry",
    "persona-self-approve",
    "persona-webhook"
  )

  Write-Host "Deploying $($critical.Count) critical functions..." -ForegroundColor Yellow
  npx supabase functions deploy @critical --project-ref $ProjectRef
  Write-Host "Functions OK" -ForegroundColor Green
  Write-Host ""
}

function Push-Db {
  Write-Host "Database: run supabase/production-sql.sql in Dashboard SQL Editor." -ForegroundColor Yellow
  Write-Host "Full db push is skipped - run production-sql.sql manually instead." -ForegroundColor DarkYellow
  Write-Host ""
}

try {
  if ($SecretsOnly) { Push-Secrets; exit 0 }
  if ($FunctionsOnly) { Deploy-Functions; exit 0 }
  if ($DbOnly) { Push-Db; exit 0 }

  if (-not $SkipSecrets) { Push-Secrets }
  Deploy-Functions
  Push-Db

  Write-Host "=== Deploy complete ===" -ForegroundColor Green
  Write-Host "Dashboard: https://supabase.com/dashboard/project/$ProjectRef"
  Write-Host "Next: complete manual steps in supabase/PRODUCTION-DEPLOY.md"
} catch {
  Write-Host ""
  Write-Host "Deploy failed: $_" -ForegroundColor Red
  Write-Host "If you see 403, log in with the Supabase account that owns project $ProjectRef"
  Write-Host "  npx supabase login"
  exit 1
}
