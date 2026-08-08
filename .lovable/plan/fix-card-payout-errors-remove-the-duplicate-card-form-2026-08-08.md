# Fix card payout errors + remove the duplicate card form

## 1. The payout error in the screenshot

The toast is raised by `flw-card-charge`:

> "Company Flutterwave is V4-only. Set FLW_ENCRYPTION_KEY to the base64 Encryption key from Flutterwave → Settings → API (not the old 24-char V3 key)."

That branch runs when the company Flutterwave credentials are V4 (OAuth) but no usable base64 encryption key is present. `getFlwV4EncryptionKey()` accepts a key only when it decodes to 16/24/32 bytes and prefers `FLW_V4_ENCRYPTION_KEY`, then falls back to `FLW_ENCRYPTION_KEY`. So the currently-stored key is either missing or still the legacy 24-character V3 key — the charge never reaches Flutterwave and the card checkout dead-ends.

Fix, in this order:

1. **Set the key.** Store the base64 Encryption key (roughly 44 chars) as `FLW_V4_ENCRYPTION_KEY` so the V3 derivation path is left untouched for any legacy calls. You'll be prompted with a secure form for the value.
2. **Validate at boot, not mid-charge.** In `flw-card-charge`, when V4 is configured but the key does not decode to 32 bytes, return the specific reason (missing vs wrong length vs not base64) instead of one generic sentence, and log the decoded byte length so the wrong-key case is diagnosable from the function logs.
3. **Stop losing the entered card.** On this configuration failure the form currently resets; keep the entered details on screen and show a retry so a re-attempt after the secret is set does not need re-typing.
4. **Verify.** Run one live small CAD → ZMW card charge and confirm the charge is created (or a real bank challenge appears) rather than the configuration toast.

Note: the ZMW payout-side work already landed (single canonical `260…` number, NGN→USD→ZMW funding, Fincra error classification with Elicate/Flutterwave failover, `routing_attempts` logging). This item is purely the card *pay-in* leg.

## 2. Remove the duplicate card capture at Confirm

Today card details are asked for twice: the step-1 "Card checkout" panel offers a quick-add card, and then the Confirm step renders a full second card form (`FlutterwaveCardForm`) with its own amount box, brand header and Pay button.

Change:

- Card fields (cardholder name, card number, expiry, CVC, optional billing street/city/ZIP) move **into the step-1 card checkout panel**, entered once. The panel keeps the existing charge summary, formatting, brand detection and validation from the current card form so behaviour is unchanged.
- Continue is enabled only when the card fields are complete and valid.
- The Confirm step shows the quote plus a masked "Visa •••• 3701, exp 02/31" line and a single "Pay C$x & send" button. No second card form, no duplicate amount field, no second branded checkout header.
- Any bank challenge (PIN / OTP / 3-D Secure / AVS) still appears at Confirm after the Pay press, since it can only come back from the provider.
- The hosted-redirect corridors (non-inline rails) are unchanged: the panel keeps the "you'll enter details on the secure page" note and Confirm keeps its redirect button.

## Technical notes

- `supabase/functions/flw-card-charge/index.ts` — precise V4 key diagnostics and logging.
- `supabase/functions/_shared/flw-encrypt.ts` — return the reason a candidate key was rejected so the function can report it.
- `src/components/send/MethodCheckoutPanel.tsx` — host the card fields; card state and validity lifted to `SendPage`.
- `src/pages/SendPage.tsx` — remove the `FlutterwaveCardForm` block at step 3, pass the collected card payload straight to the charge call, render the masked-card summary, extend the step-1 validity gate.
- `src/components/payments/FlutterwaveCardForm.tsx` — field/validation/challenge helpers extracted for reuse; the component itself stays for the Top-up page and modals.

No database or schema changes.
