# Fix the Send error + confirm the Canada → Zambia architecture

## 1. What's actually happening in the screenshot

Edge logs confirm the payout to Flutterwave returns:

```
POST /v3/transfers -> 400
{"status":"error","message":"Please enable IP Whitelisting to access this service"}
```

This is an **account-side setting on Flutterwave** — not a code bug. Our `flutterwave-payout` function already handles it correctly:
- reverses the ledger (refunds the wallet)
- marks the transfer `failed`
- returns a clear user message + `code: "provider_setup_required"`

`execute-transfer` then returns HTTP **400** with that body. The Supabase JS client's `functions.invoke()` treats any non-2xx as a thrown `FunctionsHttpError` and only exposes the generic string **"Edge Function returned a non-2xx status code"** — which is the toast the user sees. The friendly message and the "funds returned" info never reach the UI.

## 2. The fix (frontend + edge response shape only — no business logic changes)

**a. `supabase/functions/execute-transfer/index.ts`** — for the payout-failure branch only, return HTTP **200** with `{ success: false, error, code, refunded }` instead of 400. Validation/auth errors stay 4xx. This lets the client read the body without `functions.invoke` swallowing it.

**b. `src/pages/SendPage.tsx`** — when calling `execute-transfer`:
- if `error` is a `FunctionsHttpError`, read `await error.context.response.json()` to recover the structured body
- show a clear toast: title "Transfer failed — funds returned" when `refunded === true`, with the descriptive `error` string as description; otherwise show the raw `error`
- keep the existing success path unchanged

**c. (Optional, no code change required)** Once the user enables IP whitelisting on the Flutterwave dashboard for the Supabase Edge runtime egress IPs, ZMW payouts will succeed automatically — no redeploy needed.

No DB migrations, no ledger changes, no FX changes, no new dependencies.

## 3. Confirmation of the architecture you described

Your write-up matches what's already implemented in eFinMoney. Concretely:

| Layer | Your spec | What's in the codebase |
|---|---|---|
| Canada funding | Interac / debit / Stripe / VoPay / Plaid | Stripe (cards + saved cards), Paysafe (Interac e-Transfer + EFT), Plaid (bank link) — all wired |
| Internal ledger (CAD) | Double-entry, fees, FX spread | `ledger_entries` strict double-entry, balances are derived views, sales-tax module on fees |
| FX engine | CAD → ZMW with markup | `refresh-fx-rates` (OpenExchangeRates) + 0.5% markup, `fx_rates` time-series, `fx-engine` |
| Africa payout | Flutterwave Transfers API → MTN / Airtel / Zamtel | `flutterwave-payout` V3 with `V3_MM_BANK` mapping for ZMW: MTN / ATL / ZAMTEL |
| Africa collections (top-up) | Mobile-money charge | `flw-initialize-payment` maps ZMW → `mobilemoneyzambia`; TopUpPage exposes network + phone fields |
| Compliance | FINTRAC MSB, AML, sanctions, monitoring | `compliance_alerts`, velocity/structuring monitoring, SAR generation, audit logs |
| Settlement | Prefunded ZMW float (Option A) | This is what Flutterwave's `debit_currency: "ZMW"` payout assumes — confirmed correct in the request body in the logs |

Two operational items that are **outside code** and remain on you:
- **Flutterwave**: enable IP whitelisting (or disable the requirement) for Supabase Edge egress, and confirm prefunded ZMW float is in place.
- **Compliance**: FINTRAC MSB registration in Canada; Zambia delivery is covered by Flutterwave's local licensing.

Everything in your "Recommended Stack" table is already represented in the project. The only blocker for live ZMW payouts right now is the Flutterwave IP-whitelist setting, which the fix above will surface clearly to senders (and to ops via the existing `ProviderStatusPanel`) until you toggle it.
