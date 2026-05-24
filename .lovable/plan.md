## Add Interac e-Transfer as a parallel option (direct Interac for Developers)

Add a second Interac e-Transfer rail that calls Interac's Send Money API directly, alongside the existing Paysafe-backed Interac option. The Paysafe option stays in the codebase but is disabled in the UI until Paysafe enables Interac on the merchant account.

### Important reality-check before we build

Interac for Developers exposes **Send Money** (and Money Request) APIs, but production access is currently restricted to:
- Regulated Canadian financial institutions, or
- A sponsor FI that fronts your traffic.

The dev portal will let us register an app, get sandbox credentials, and integrate against the **sandbox** today. Going live still requires either an Interac sponsorship agreement or a connected FI partner. Build will work end-to-end against sandbox; the live switch depends on Interac approval.

If that's understood, here's the plan:

### UI changes (CanadaSendFlow.tsx)

Add a new delivery method tile next to the existing ones:

```text
[ Interac e-Transfer (Direct) ]  ← NEW, enabled
[ Interac e-Transfer (Paysafe) ]  ← existing, shown disabled with "Coming back soon" badge
[ EFT (1-3 days) ]
[ Visa Direct (Card push) ]
```

- New `DeliveryMethod` value: `"interac_direct"`.
- Fee: same display logic as current `interac` (configurable; default $0.50).
- Hide the old Paysafe Interac option entirely OR keep visible-but-disabled with a tooltip — your call (default: keep visible-but-disabled so users see it's coming back).
- All other fields (recipient name, email, security Q/A, message) stay identical.

### Backend (new edge function)

New function: `supabase/functions/interac-send/index.ts`

Responsibilities:
1. Auth: verify JWT, load sender profile + wallet, check KYC tier limits.
2. Validate request (recipient name/email, amount, currency=CAD, security question + answer, optional message). Use Zod.
3. Debit sender wallet via existing ledger helpers; create a `transfers` row with `status='pending'`, `provider='interac_direct'`, `funding_source='wallet'`.
4. Call Interac Send Money API:
   - OAuth2 client-credentials token request to Interac's token endpoint.
   - `POST /money-transfer/v1/send` with payer reference, recipient contact, amount, security question/answer, message.
   - Store `interac_transfer_ref` on the transfer row.
5. On API error → refund wallet, mark transfer `failed`, return user-friendly error (mirroring `paysafe-payout` refund flow).
6. Return `{ transferId, status }`.

New function: `supabase/functions/interac-webhook/index.ts`
- Receives status callbacks (`accepted`, `declined`, `expired`, `cancelled`).
- Verifies Interac signature.
- Updates `transfers.status`; on `declined`/`expired` → refund wallet via existing reversal journal.

### Secrets needed

Add via `add_secret`:
- `INTERAC_SEND_CLIENT_ID`
- `INTERAC_SEND_CLIENT_SECRET`
- `INTERAC_SEND_API_BASE` (sandbox vs production base URL)
- `INTERAC_SEND_PAYER_ID` (originator/partner ID Interac issues)
- `INTERAC_SEND_WEBHOOK_SECRET` (HMAC validation)

(Reusing the existing KYC `INTERAC_*` secrets is **not** appropriate — Send Money is a separate Interac product with its own credentials and scopes.)

### Database

No schema changes required. Reuse the existing `transfers` table; just store new provider value:
- `provider = 'interac_direct'`
- `provider_reference = <Interac transfer ref>`

If you want history filtering, an index/check constraint can be added later.

### Frontend wiring

- `src/lib/transfer.ts` (or wherever Canada flow submits): new branch that calls `supabase.functions.invoke('interac-send', { body })` when `delivery === 'interac_direct'`.
- Success screen shows: "We've sent the recipient an Interac e-Transfer email. They'll deposit it within 30 days." with the receipt download.

### Out of scope

- Removing Paysafe code — left intact so it can re-enable instantly once Paysafe support enables Interac on the merchant account.
- Interac Money Request (different API; not in this change).
- Production go-live with Interac (requires sponsor/FI agreement; we'll be sandbox-only until then).

### Open question I need you to confirm before I switch to build mode

Do you already have Interac for Developers credentials (sandbox at minimum), or do I add the secret placeholders so you can paste them in once you've registered the app at developer.interac.ca? Answering "go" assumes the latter — I'll request the secrets and build the integration against the documented sandbox spec.
