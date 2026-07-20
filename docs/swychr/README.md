# Swychr Connect API specs

OpenAPI specs for Payin, Payout, Virtual Cards, and Airtime.

- `payin.yaml` — hosted payment links + webhook
- `payout.yaml` — bank/MoMo payouts + Nigeria banks
- `card.yaml` — virtual card issuance (**live** `/api/card/prod`; sandbox only if `SWYCHR_CARD_SANDBOX=true`)
- `airtime.yaml` — PrepayNation mobile recharge (**live** `/api/airtime/prod` only)

## Auth (no dashboard API key)

Call `/admin/auth` (payin/payout) with admin email + password. Response includes a **Bearer token valid ~90 days**. Edge functions cache that token and re-login on 401.

## Edge secrets

```
SWYCHR_ENABLED=true
SWYCHR_EMAIL=...
SWYCHR_PASSWORD=...
SWYCHR_WEBHOOK_SECRET=...
SWYCHR_CARD_SANDBOX=false  # true = card sandbox; omit/false = live prod
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

Enable UI with `VITE_FEATURE_SWYCHR=true` / `VITE_FEATURE_CARDS=true` when ready.

## Live cards — ops notes

- Cardholder create must use **`/create_full_user`** (prod `/create_user` returns `user_id: null`).
- Issuance calls `/issue_lite_card` and debits the **admin Box wallet**. Check balance:

```bash
node scripts/swychr-wallet-bal.mjs
```

If `wallet_bal` is `0`, fund the wallet in the AccountPe/Swychr dashboard before issuing (fee ≈ $10 + initial load).
