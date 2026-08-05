# Deploy ALL edge functions one-by-one to your own Supabase project.
# Safer for Windows/CLI because batch deploy often returns 403 mid-run.
#
# Usage:
#   cd efinmoney-d4767097
#   .\supabase\scripts\Deploy-All-Functions-Your-Supabase.ps1 -ProjectRef "your-project-ref"
#
# If you want to push secrets first, create a .env file and set them manually:
#   npx supabase secrets set --project-ref <your-project-ref> KEY=VALUE KEY2=VALUE2

param(
  [Parameter(Mandatory=$true, HelpMessage="Your Supabase project ref (the part after /project/ in dashboard URL)")]
  [string]$ProjectRef,

  [switch]$SkipSecrets
)

$ErrorActionPreference = "Stop"

function Deploy-AllFunctions {
  Write-Host "=== Deploying all edge functions to $ProjectRef ===" -ForegroundColor Cyan

  # Link project first
  Write-Host "Linking project..." -ForegroundColor Yellow
  npx supabase link --project-ref $ProjectRef
  Write-Host "Project linked" -ForegroundColor Green

  # Get all function directories, excluding _shared
  $functions = Get-ChildItem -Path "supabase/functions" -Directory |
    Where-Object { $_.Name -ne "_shared" } |
    Select-Object -ExpandProperty Name |
    Sort-Object

  Write-Host "Found $($functions.Count) functions to deploy" -ForegroundColor Yellow

  $failed = @()
  $success = 0

  foreach ($fn in $functions) {
    Write-Host "  -> [$($success + 1)/$($functions.Count)] $fn" -ForegroundColor DarkCyan
    try {
      npx supabase functions deploy $fn --project-ref $ProjectRef
      if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
      $success++
    } catch {
      Write-Host "    FAILED: $fn - $_" -ForegroundColor Red
      $failed += $fn
    }
  }

  Write-Host ""
  if ($failed.Count -eq 0) {
    Write-Host "=== All $success functions deployed successfully ===" -ForegroundColor Green
  } else {
    Write-Host "=== Deploy incomplete ===" -ForegroundColor Red
    Write-Host "Failed functions ($($failed.Count)):`n$($failed -join ', ')" -ForegroundColor Red
    Write-Host "Re-run them individually:" -ForegroundColor Yellow
    foreach ($fn in $failed) {
      Write-Host "  npx supabase functions deploy $fn --project-ref $ProjectRef" -ForegroundColor Yellow
    }
  }
}

try {
  Deploy-AllFunctions
} catch {
  Write-Host ""
  Write-Host "Deploy failed: $_" -ForegroundColor Red
  Write-Host "Make sure you are logged in: npx supabase login" -ForegroundColor Yellow
  exit 1
}
