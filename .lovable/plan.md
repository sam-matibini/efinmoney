# Sendwave-style transfer form layout

Refine the layout of Step 1 in the international send flow so it reads like the reference: a tight, single card with a country picker in the header, one boxed recipient field, a paired "You send / They receive" row, and a single prominent CTA.

## Layout changes

```text
Send money to                        [flag] Zambia v
--------------------------------------------------
| RECIPIENT                                    [+] |
| Recipient name                                   |
--------------------------------------------------
| YOU SEND        | THEY RECEIVE     | ZMW  v |
| $0.00           | 0.00             |        |
--------------------------------------------------
     Exchange Rate: 1 CAD = 13.213 ZMW
     Transfer fees: 0.99 CAD fee

           [  Continue to send  ]
```

1. **Header row** — Move the destination-country selector out of the body and into the card header, sitting inline to the right of the "Send money to" title (flag + country name + chevron). Drop the current subtitle.
2. **Recipient block** — Single bordered box with a small uppercase "RECIPIENT" caption, the name input inline (no separate label above), and the quick-add-recipient person+ icon anchored to the right inside the box. "Browse all contacts" and the "Contact selected" confirmation chip stay but move directly under the box as compact secondary text.
3. **Amount block** — Replace the stacked amount inputs with one bordered row split into two cells: "YOU SEND" (base currency, focused state with primary border) and "THEY RECEIVE", plus the receive-currency dropdown pinned to the right edge of the row.
4. **Rate/fee line** — Centered two-line caption under the amount row: exchange rate, then transfer fee (fee-on-top wording preserved).
5. **CTA** — Full-width pill button labelled "Continue to send"; "Cancel" stays as a quiet link below.
6. **Payout details, payment method and remaining fields** — Keep all existing conditional blocks (payout method, network, bank fields, method checkout panel) below the fold in the same card, visually de-emphasised so the top of the form matches the reference.

Nothing about the send logic, fee math, FX source, validation rules or step navigation changes — this is a presentation-only refinement.

## Technical notes

- All work is in `src/pages/SendPage.tsx` (step 1 block, ~lines 2121-2579) plus small presentational subcomponents under `src/components/send/` to keep the page readable:
  - `SendHeaderCountry.tsx` — title + inline country select.
  - `RecipientQuickBox.tsx` — bordered recipient field with quick-add icon.
  - `AmountPairRow.tsx` — paired send/receive inputs with currency dropdown.
- `MoneyFlowShell` gains an optional `headerRight` slot for the country picker; stepper and card chrome are unchanged.
- `LiveFxCalculator` keeps supplying the rate and fee values; only the rendering of the rate/fee caption is restyled (existing `feeNote` prop reused).
- Colors come from existing semantic tokens (`--primary`, `--muted-foreground`, `--border`) — no hardcoded palette values.
