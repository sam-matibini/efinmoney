## Goal

Make Zambia (ZMW) work end-to-end on both sides:

1. **Payout (send to ZM)** — keep the Flutterwave Transfers API path (correct API for paying a recipient's MTN/Airtel/Zamtel wallet), but stop silently failing on the "IP whitelisting" error and add a clean fallback + clear ops guidance.
2. **Collection (top-up from ZM)** — wire the `mobile_money_zambia` charge per the docs you shared so Zambian users can fund their wallet with MTN/Airtel/Zamtel.

The two are **different Flutterwave APIs** and we should not conflate them. `/v3/charges?type=mobile_money_zambia` is for collecting from a customer; `/v3/transfers` is for paying out to a beneficiary. Our `/send` flow is a payout.

---

## Part 1 — Fix Zambia payout

### What's broken
`flutterwave-payout` posts to `/v3/transfers` with `account_bank=MTN`, `currency=ZMW`, `debit_currency=ZMW`. Flutterwave returns:
> `Please enable IP Whitelisting to access this service`

This is an **account-level setting on Flutterwave's dashboard** (Settings → API → IP Whitelisting), not a code bug. Today we mark the transfer "funded" before payout and never reverse on this failure — so the sender's wallet is debited and the operations team has no signal.

### Changes
1. **`flutterwave-payout`**
   - Route ZMW the same way ZMW already is, but also accept `network ∈ {mtn, airtel, zamtel}` from the resolver (already mapped via `V3_MM_BANK`).
   - When the response contains "IP whitelisting"/"whitelist"/"access this service", classify as `provider_setup_required` (already partly detected by `isTemporaryProviderSetupError`) and:
     - **Reverse the ledger** (already implemented — call `reverseTransferLedger`).
     - Mark transfer `failed` with `failure_reason = "Provider setup required: enable IP whitelisting on Flutterwave for ZMW payouts. Funds returned."`
     - Insert a `notifications` row for the sender AND a `compliance_alerts`/ops note so it surfaces in `/operations`.
   - Return a structured `{ error, code: "provider_setup_required" }` payload.

2. **`execute-transfer`**
   - When `payoutResult.code === "provider_setup_required"`, surface the message back to the client so the SendPage shows: "Zambia payouts are temporarily unavailable — your funds have been returned. Please try again shortly." (no leaking provider name to the end user).

3. **Operations dashboard tile (read-only display)**
   - Add a small "Provider status" row in `OperationsDashboard` that lists transfers failed with `failure_reason ILIKE '%Provider setup required%'` in the last 24h, so ops sees the IP-whitelist backlog. Pure SELECT, no new tables.

4. **Network resolution (already correct)**
   - `execute-transfer` already maps `payout_method` (`mtn_mobile`/`airtel_money`/`zamtel_money`) → `mtn`/`airtel`/`zamtel`. No change needed.

### Out of scope (one-line note for you, not code)
The IP-whitelist toggle itself must be done on the Flutterwave dashboard by an account admin, then the egress IPs of the Supabase functions added. Once that's flipped, the same code path will start succeeding without redeploy.

---

## Part 2 — Add ZMW mobile-money top-ups (collection)

### What we already have
`flw-initialize-payment` already maps `currency === "ZMW"` to `payment_options = "mobilemoneyzambia"` and uses `/v3/payments` (Flutterwave's hosted checkout), which internally drives the same `mobile_money_zambia` charge flow described in the docs. The hosted-checkout route is preferred over the direct `/v3/charges?type=mobile_money_zambia` because it handles the redirect-to-authorize step and CAPTCHA for us.

### Changes
1. **`TopUpPage`** — when destination wallet is ZMW (or user picks "ZMW mobile money"):
   - Show a network selector (MTN, Airtel, Zamtel — reuse `src/lib/mobileMoneyNetworks.ts`).
   - Show a phone input (Zambian format `+260…`, validated).
   - Min amount uses `MIN_AMOUNTS.ZMW = 5` (already in `flutterwave.ts`).
   - Call `initializeFlwPayment({ amount, currency: "ZMW", paymentMethod: "mobilemoney", network, phone, country: "ZM", redirectUrl })` — already supported by `flw-initialize-payment`.
   - On success, redirect to `payment_link`.

2. **`flutterwave-webhook`** — already handles `charge.completed` and credits wallets; verify it handles `payment_type === "mobilemoneyzm"` by treating any `status === "successful"` ZMW charge as a wallet credit. Add a small whitelist if missing.

3. **`flw-initialize-payment`** — no change; the `mobilemoneyzambia` mapping is already there.

---

## Files

- `supabase/functions/flutterwave-payout/index.ts` — refine error classification + reversal + notification on IP-whitelist failure.
- `supabase/functions/execute-transfer/index.ts` — propagate `provider_setup_required` code to the response.
- `supabase/functions/flutterwave-webhook/index.ts` — ensure `mobilemoneyzm` ZMW charges credit the wallet.
- `src/pages/TopUpPage.tsx` — ZMW + network/phone UI branch.
- `src/pages/OperationsDashboard.tsx` (or a small new panel under it) — provider-setup failures tile.

No DB migrations. No new secrets. No changes to FX, fees, or ledger semantics.

---

## What you'll see after

- **Sending to a Zambia MTN/Airtel/Zamtel number from Canada**: if Flutterwave still blocks the call, the ledger is reversed automatically, the sender sees "funds returned, try again", and ops sees the failure in the Operations dashboard. Once IP whitelisting is enabled on the Flutterwave dashboard, the same payout succeeds with no code change.
- **Topping up a ZMW wallet**: pick MTN/Airtel/Zamtel, enter the Zambian phone, get redirected to Flutterwave's hosted authorize page, return to the app credited.
