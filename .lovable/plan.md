# Payment Partners: EFN reference numbers

## What I checked first

The 13 partner rows in the database already match your list exactly on direction, country, settlement currency, reliability, priority and status. Confirmed values today:

| Partner | Dir | Country | Ccy | Rel. | Prio | Status |
|---|---|---|---|---|---|---|
| Fincra | both | NG | USD | 93 | 40 | active |
| Flutterwave | both | NG | USD | 97 | 20 | active |
| Nomba | both | NG | NGN | 96 | 10 | active |
| PawaPay | payout | GB | USD | 96 | 20 | active |
| Paysafe | both | CA | CAD | 94 | 30 | active |
| Paytota | both | KE | USD | 88 | 70 | active |
| Square | payin | US | USD | 97 | 15 | active |
| Stellar SEP-31 | payout | US | USDC | 92 | 50 | inactive |
| Stripe | both | US | USD | 98 | 15 | inactive |
| Swychr | both | CM | XAF | 90 | 60 | active |
| Wise | payin | GB | CAD | 96 | 10 | active |

So the only difference is the code column: yours are `EFN0001…EFN0011`, the database stores slugs (`fincra`, `flutterwave`, `wise`, …). Two rows aren't in your list at all: **Adyen** (NL, EUR, payin, inactive) and **Circle CPN** (US, USDC, payout, active).

## Recommendation: don't overwrite `code` — add a reference number

The existing `code` slug is the routing key. It's matched by name in the route resolver, rate cards, routing overrides, cost assurance, liquidity refresh and the network-seed function. Replacing `fincra` with `EFN0001` would silently break payout routing, so the safe design is:

- `code` stays the machine slug (internal, still shown but clearly labelled as the routing key).
- New `partner_ref` column holds the human reference `EFN####`, unique, auto-assigned on creation from a sequence, and shown as the primary **Ref** column in the table.

That gives you the tidy EFN numbering you want with zero routing risk, and every future partner gets its next number automatically.

## Plan

1. Backend migration: add `partner_ref text unique` to `payment_partners`, a sequence + trigger that assigns `EFN` + zero-padded next number when a row is inserted without one.
2. Backfill your exact mapping: Fincra EFN0001, Flutterwave EFN0002, Nomba EFN0003, PawaPay EFN0004, Paysafe EFN0005, Paytota EFN0006, Square EFN0007, Stellar SEP-31 EFN0008, Stripe EFN0009, Swychr EFN0010, Wise EFN0011. Adyen and Circle CPN get EFN0012 / EFN0013 (kept, not deleted — Adyen stays inactive, Circle CPN is used by the CPN corridors).
3. Set the sequence to continue from 13 so the next partner created is EFN0014.
4. Partners panel UI: add a sortable/filterable **Ref** column as the first column, keep **Code** as the routing slug (read-only on edit, as today), include Ref in CSV/Excel export and in the import template.
5. Import matching: rows match on `partner_ref` first, then `code`, then name — so you can maintain the table from a spreadsheet keyed on EFN numbers. Ref is never changed by import; blank Ref on a new row is auto-assigned.
6. Verify from the database that all 13 refs are unique and sequential, then confirm the table renders and exports the Ref column.

## Going forward

- Maintain partners from the Partners panel (or the CSV/XLSX import) — the EFN ref is issued automatically, so you never assign numbers by hand.
- Use the EFN ref in ops conversations, invoices and reconciliation; use `code` only when wiring a new integration.
- Retiring a partner: set status inactive rather than deleting, so its EFN ref stays reserved and historical routing decisions keep resolving.

## Technical notes

- Files: `src/components/settings/partners/PartnersPanel.tsx` (column, dialog display, export/import), `src/hooks/usePartnerNetwork.tsx` (add `partner_ref` to the type and select).
- No change to `supabase/functions/_shared/routeResolver.ts` or any edge function — they keep using `code`.

## SQL

One migration: add `partner_ref` + unique index, sequence `payment_partner_ref_seq`, `before insert` trigger to assign, backfill the 13 refs, advance the sequence.
