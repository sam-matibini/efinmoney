## Problem

The Tracking Timeline shows the raw operations-only failure message:

> "Provider setup required: enable IP whitelisting on Flutterwave for ZMW payouts. Funds returned. (raw: Please enable IP Whitelisting to access this service)"

That string is meant for the ops dashboard (`ProviderStatusPanel` filters on `%Provider setup required%`). Senders should see a friendly message — the user-friendly version is already built in `flutterwave-payout` and sent in notifications, but `failure_reason` on the `transfers` row stores the ops version, and `TransferTrackingPage` renders it verbatim.

The actual Flutterwave IP-whitelisting toggle is **not a code change** — it's done in the Flutterwave merchant dashboard (Settings → API → IP whitelisting) by adding the Supabase Edge Function egress IPs. Once toggled, ZMW payouts succeed automatically with no redeploy. I'll surface this clearly at the end.

## Fix (frontend-only, presentation)

**`src/pages/TransferTrackingPage.tsx`** — sanitize `failure_reason` before rendering:

- If it starts with `Provider setup required` (or contains `IP Whitelisting` / `whitelist`), replace with:
  > "This payout corridor is temporarily unavailable. Your funds have been returned to your wallet. Please try again shortly or contact support."
- If it contains `(raw: ...)`, strip the parenthetical raw segment.
- Otherwise display the existing reason as-is.

Implementation: small helper `friendlyFailureReason(reason: string)` used only in the tracking-timeline error box.

No edge-function, no DB, no ledger changes. The ops-side `failure_reason` value stays intact for `ProviderStatusPanel` and audit.

## Operator action (outside code)

Enable IP whitelisting on Flutterwave for ZMW payouts:

1. Log in to Flutterwave dashboard → Settings → API → IP Whitelisting
2. Add the Supabase Edge Function egress IPs (request from Lovable Cloud support if unknown — typically a small range)
3. Save. Retry a ZMW transfer — payout will go through automatically; no redeploy.

After that, this friendly message stops appearing because the call no longer fails.