# Load real partner pricing from the signed rate sheets

I read the seven uploaded documents and extracted every fee table into one Excel workbook that matches the `partner_pricing` import columns exactly. The workbook is attached for your review — nothing is loaded into the database until you confirm the flagged items.

## What the documents contained

| Document | What it gives us | Rows extracted |
| --- | --- | --- |
| Nomba Global Payout & FX Pricing | Payout corridors (Africa, CA, UK, EU, US) + DRC/Nigeria collections | 23 |
| Flutterwave MSA — Annexure 1 | Collections + payouts across 17 markets, refund/chargeback fees, settlement terms | 40 + 4 |
| Swychr Service Agreement — Appendix 1 | Bulk payout (20 countries) + payment-link collections (18 countries) | 38 |
| Pricing Document — Africa | Pay-in/payout rate card across 20 African markets by operator | 73 |
| Pricing Document — GPS | Virtual-account platform fees (setup, monthly, SWIFT/SEPA/FPS/CHAPS in-out) | 35 |
| Nomba Payment Service Agreement, Swychr standard template | Contract terms only — no pricing beyond the above | — |

## Needs your confirmation before import

1. **Who owns the "Africa" rate card and the "GPS" card?** Neither PDF names the partner. Those two sheets are marked `TBC` / `EFN0000` and are held back from import until you tell me the partner (Fincra, PawaPay, Paytota, or another).
2. **Burkina Faso — Orange payout fee** is blank in the Africa PDF (Moov is $1.70). Same as Moov?
3. **EUR SEPA individual payout fee** is blank in the GPS PDF (SEPA Instant is €3).
4. **Nomba account-type tiers:** ZAR bank $5 personal / $10 business, and US wire 0.3%+$15 business / +$30 personal. Confirm we tier by account type.
5. **Swychr Congo DRC** payout — fee currency CDF or USD?

## How it gets integrated

**1. Partner cost pricing → `partner_pricing`**
Each row becomes one versioned pricing record keyed to the partner, direction, destination country/currency, and payment method, with `source = file` and `source_reference` naming the PDF so every number is auditable. Existing placeholder rows I seeded earlier get end-dated (`effective_to`) rather than deleted, so history is preserved.

**2. Tiered schedules → `tiers` JSON**
Five schedules are banded rather than flat and go into the `tiers` column with `fee_type = tiered`: Nigeria bank payout (≤5k / 5,001–50k / >50k), Malawi Airtel collections, Tanzania and Uganda mobile-money payouts, Ivory Coast bank payout (≥50M XOF).

**3. Platform fees → separate handling**
The GPS setup fee, monthly minimum, and account maintenance fees are not per-transaction corridor costs, so they don't belong in `partner_pricing`. They stay in their own sheet and I'll surface them as fixed monthly cost inputs in the margin/profitability view rather than distorting per-transaction pricing.

**4. Refund / chargeback / settlement terms**
Flutterwave's $3.50 refund, $38 chargeback, and T+1 / T+7 settlement windows load against the partner record so routing and liquidity forecasting can use the real settlement lag.

**5. Coverage check after import**
Once loaded I'll run the existing `pricing_coverage_gaps` check so you can see any live corridor that still has no cost pricing behind it, and confirm the Partner Pricing tab renders the imported versions with the export/import toolbar already built.

## Technical notes

- Import path: bulk `INSERT` into `public.partner_pricing` joined on `payment_partners.partner_ref`, with `effective_from` set to the agreement dates (Flutterwave 2026-07-30, Swychr 2026-07-15, Nomba current) and prior placeholder rows end-dated in the same statement.
- `percentage_fee` is stored as a percentage number (1.5 = 1.5%); the workbook displays those cells formatted as percentages.
- No schema change is required — every field in the workbook maps to an existing column, including `tiers`, `min_fee`, `max_fee`, and `fee_currency`.
- No frontend change is required for the Partner Pricing tab; it already reads this table and supports sort, filter, and Excel export.

## Deliverable

The workbook is ready now — review it, answer the five confirmation points, and I'll load it.
