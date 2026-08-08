# Zambia payouts: reduce failures and add rail resilience

## What the data shows

Of the last 15 ZMW transfers, 12 failed. The recorded `failure_reason` values fall into four distinct groups:

1. **Fincra provider outage** — "Transaction failed, please contact support or re-try after awhile." on AIRTEL, MTN and ZAMTEL in the same transfer (6 Aug, 5 Aug). Every network was attempted and all returned the same generic Fincra error, so this is upstream, not recipient-specific.
2. **Bad phone formats** — "Please enter a valid mobile money account number for ZM." for `260260770069550` and `0260770069550`. The Zambia branch of the phone normaliser is emitting doubled dial-code and `0260…` variants that Fincra rejects, wasting attempts before the correct `260770069550` is tried.
3. **Wrong funding wallet** — "No currency supported to make payout to, from RWF". The funding-candidate chain drifted to an RWF wallet even though ZMW is supposed to be limited to `NGN → USD → ZMW`.
4. **Corridor down** — "Zambia is currently undergoing maintenance, please check back later" and "This payout is temporarily unavailable." Nothing was attempted after that; the transfer just failed.

Zambia is currently a **Fincra-exclusive corridor** in `execute-transfer` (`fincraExclusiveCorridor` blocks Flutterwave, Elicate and Lenhub, and `isFlutterwaveCorridorTransfer` hard-excludes ZMW/ZM). So each of the above becomes a hard user-facing failure with no second rail.

## The fix

### 1. Stop wasting attempts on invalid phone formats
In `fincra-payout`, the ZMW branch should return exactly one candidate: the E.164 `260XXXXXXXXX` form. Drop the `0260…` and doubled-dial variants entirely, and reject obviously malformed numbers up front with a clear message instead of sending them to Fincra.

### 2. Keep ZMW funding on its intended wallets
Enforce the `NGN → USD → ZMW` funding chain for ZMW so a candidate like RWF can never be selected, and surface "no fundable source wallet" as its own error code rather than Fincra's confusing "No currency supported… from RWF".

### 3. Distinguish provider outage from a real decline
Classify Fincra responses into:
- **corridor_down** — "undergoing maintenance", "temporarily unavailable"
- **transient** — "contact support", "re-try after awhile", "technical issue"
- **hard decline** — invalid recipient, invalid account, limits

On corridor_down / transient, stop retrying the other Zambia networks (all three return the same upstream error anyway) and move straight to failover. On a hard decline, keep the current per-network behaviour.

### 4. Add a controlled failover for Zambia
Relax the Fincra-exclusive rule for ZMW so that when Fincra returns corridor_down or transient, `execute-transfer` continues down the chain to the next Zambia-capable rail (Elicate ZMW, then Flutterwave ZMW mobile money) instead of failing. Conditions:
- Failover only on corridor_down / transient — never on a hard decline, so a bad number is not re-attempted on another provider.
- The wallet stays funded between attempts (the existing `skip_reversal` pattern), and the reversal happens only after the last rail fails.
- Only one payout can succeed: the rail that accepts wins, and its reference is written to the transfer before the next rail is tried, as the Fincra path already does.

### 5. Make failures observable
- Write one row per rail attempt into `routing_attempts` (partner code, outcome, retryable, error, latency) — this table is currently empty for Zambia, which is why there is no attempt history to review.
- Keep the full provider message in `failure_reason` but lead with a customer-safe sentence ("Zambia mobile money is temporarily unavailable — your funds have not left your wallet.").

### 6. Verify
Run a live small ZMW send to the Airtel test number and confirm: a valid single phone candidate is sent, the funding wallet is NGN/USD/ZMW, and on a Fincra outage the transfer moves to the next rail with an attempt row per rail.

## Technical notes

Files involved:
- `supabase/functions/fincra-payout/index.ts` — ZMW phone candidates, funding-candidate guard, error classification, returned error codes.
- `supabase/functions/execute-transfer/index.ts` — `fincraExclusiveCorridor` for ZMW becomes conditional on the Fincra error class; add Elicate/Flutterwave Zambia failover steps to the existing priority chain; log `routing_attempts`.
- `supabase/functions/_shared/treasury-worker.ts` — `isFlutterwaveCorridorTransfer` must allow ZMW when Zambia has fallen through to the Flutterwave step.

No schema changes (`routing_attempts` already exists). No pricing changes in this plan — the missing USD → Zambia pricing rule is a separate item.
