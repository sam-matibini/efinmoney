# Swychr Connect API specs

OpenAPI specs for Payin, Payout, Virtual Cards, and Airtime.

- `payin.yaml` — hosted payment links + webhook
- `payout.yaml` — bank/MoMo payouts + Nigeria banks
- `card.yaml` — virtual card issuance (prod + sandbox via `SWYCHR_CARD_SANDBOX=true`)
- `airtime.yaml` — PrepayNation mobile recharge catalog

## Auth (no dashboard API key)

Call `/admin/auth` (payin/payout) with admin email + password. Response includes a **Bearer token valid ~90 days**. Edge functions cache that token and re-login on 401.

## Edge secrets

```
SWYCHR_ENABLED=true
SWYCHR_EMAIL=...
SWYCHR_PASSWORD=...
SWYCHR_WEBHOOK_SECRET=...
SWYCHR_CARD_SANDBOX=true   # optional, for card sandbox
SWYCHR_PAYOUT_FALLBACK=true  # try swychr after nomba payout fails
```

Template: `scripts/.swychr.env.example` → copy to `scripts/.swychr.env` (gitignored).

## Smoke test

```bash
cd efinmoney-d4767097
# PowerShell
$env:SWYCHR_EMAIL="..."; $env:SWYCHR_PASSWORD="..."; node scripts/swychr-smoke-test.mjs
```

Or put creds in `scripts/.swychr.env` then `node scripts/swychr-smoke-test.mjs`.

Does not enable production UI (`VITE_FEATURE_SWYCHR=false` by default).
