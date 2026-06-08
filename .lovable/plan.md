## You can already do this — here's how

The eFinVISA tile on `/cards` is a static design preview. Real, fundable virtual Visa cards are issued through the Stripe Issuing flow we already shipped. Nothing new needs to be built.

## What to do in the app

1. **`/cards` → "New Card"** — opens `IssueVirtualCardModal`.
2. **Card type:** Virtual (default). Pick currency (USD or CAD).
3. **Spending controls:** set per-auth / daily / monthly limits and allowed categories.
4. **Load funds now (optional):** pick a wallet + amount in the same modal. On create, the UI calls `stripe-issuing-fund-card` automatically so the card lands already topped-up.
5. **Submit** — `stripe-issuing-create-card` mints the card at Stripe and writes it to `issued_cards`.
6. **Top up later:** open the card on `/cards/:id` → "Add Funds" → choose wallet + amount → ledger debits your wallet, credits Stripe Issuing float (account `1208`), and Stripe loads the card balance.
7. **Reveal PAN/CVV:** "Reveal Details" on the card detail page — uses Stripe's ephemeral-key reveal we wired in `StripeIssuingReveal`.

## Prerequisites (must be true for issuance to succeed)

- KYC at **tier_3** (ID + address approved).
- Profile billing address complete.
- Stripe Issuing balance > $0 on the connected account in the chosen currency. The modal now surfaces this via `stripe-issuing-balance`; if it shows $0 you need to top up the Issuing float at Stripe first.

## About "receive funds into the credit card"

Stripe Issuing cards are **spend cards**, not bank accounts — they have no IBAN/routing number and can't accept inbound transfers, P2P, or payroll. The only way money moves *onto* the card is the wallet → card top-up above. To receive money, use a wallet (`/wallets`) or the eFinMoney P2P / Send flows; then sweep into the card when you want to spend.

## If something is missing

Tell me which of these you want and I'll switch to build mode:
- Auto-sweep rule (e.g. "keep card topped up to $200 from USD wallet")
- One-click "Move all" between wallet ↔ card
- Inbound funding shortcut on the card detail page that just opens the wallet top-up flow with the card preselected as destination
