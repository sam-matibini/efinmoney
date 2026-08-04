# Fix Zambia (ZMW) payouts — route them to Fincra

## What I verified

- The Zambia payout code path already exists: `execute-transfer` tries Fincra first for mobile-money payouts in KES/GHS/UGX/TZS/**ZMW**/RWF, and `fincra-payout` already maps `ZMW:mtn`, `ZMW:airtel`, `ZMW:zamtel` and formats Zambian MSISDNs in the local `09…` form Fincra expects.
- **Fincra credentials are not present in this backend.** The secret list contains no `FINCRA_SECRET_KEY`, `FINCRA_BUSINESS_ID` or `FINCRA_PUBLIC_KEY`. `execute-transfer` gates the whole Fincra rail on those two being set, so the Fincra attempt is silently skipped for every Zambia transfer.
- With Fincra skipped, Zambia falls through to Flutterwave and then to the legacy Elicate branch — which is where the "payout is temporarily unavailable" failure the receipt shows comes from. Recent ZMW transfers in the database all carry Elicate `EP-…` references, never a Fincra reference.
- The routing engine also can't pick Fincra for Zambia: the `fincra` row in `payment_partners` lists countries `NG, GH, KE, CA` and currencies `NGN, GHS, KES, CAD` — no `ZM` / `ZMW`.

## Plan

1. **Add the Fincra credentials** (secrets): `FINCRA_SECRET_KEY`, `FINCRA_BUSINESS_ID`, `FINCRA_PUBLIC_KEY`, `FINCRA_ENV` (`live` or `sandbox`), and `FINCRA_WEBHOOK_SECRET`. Nothing below makes Zambia work without these.
2. **Register Fincra for Zambia in the partner tables** so both the fixed chain and the routing engine agree: add `ZM` to `supported_countries` and `ZMW` (plus `UGX`, `TZS`, `RWF` which `fincra-payout` already supports) to `supported_currencies`, and add/refresh the ZM mobile-money corridor row with Fincra as the primary partner.
3. **Make Zambia prefer Fincra explicitly in `execute-transfer`**: keep the Fincra → Flutterwave order, and stop the legacy `isZambia` → `elicate-payout` branch from catching Zambia mobile-money transfers that the Fincra chain should own. Elicate stays as an explicit last-resort rail rather than the default.
4. **Surface the real reason instead of a generic message**: when Fincra is unconfigured or the corridor is disabled, fail with a clear operator-facing reason (logged, and shown as "payout partner not configured") rather than "temporarily unavailable", so this misconfiguration is visible next time.
5. **Improve the Zambia failure text on the tracking page** so a partner-side rejection shows the provider message and whether funds were returned to the wallet.
6. **Verify**: run a small live ZMW payout end to end (MTN and Airtel numbers), confirm the transfer gets a Fincra reference, the webhook moves it to completed, and the ledger has no orphaned reversal.

## Technical notes

- Files touched: `supabase/functions/execute-transfer/index.ts` (Zambia branch ordering + clearer failure reason), a migration/data update for `payment_partners` / `partner_corridors`, and `src/pages/TransferTrackingPage.tsx` (failure copy). `fincra-payout` and `_shared/fincra.ts` need no logic change.
- Fincra egress goes through the existing Cloudflare worker proxy (`FINCRA_PROXY_URL` / `FLW_PROXY_URL`); if Fincra IP-whitelists, whitelist the worker egress, not the functions.
- Airtel ZMW rejects decimal amounts — already handled by rounding in `fincra-payout`.

## Needed from you

The Fincra live (or sandbox) API key, business ID, public key and webhook secret. I'll add them as secrets when you approve.
