## Goal

1. One source of truth for what a customer is charged — remove the four parallel pricing paths that currently bypass it.
2. Make the pricing engine visible in the financial statements: revenue, partner cost, and margin reported from the same numbers the engine quoted.

## Current state (verified)

Canonical engine: `efinmoney_pricing` (versioned rate card) + `_shared/routingEngine.ts` (`computeFee`, `computeCustomerRevenue`, `computePartnerCost`), consumed by `routeResolver.ts` and `transactionEconomics.ts`.

Bypasses found:
- `src/components/send/CanadaSendFlow.tsx:111` — hardcoded `DELIVERY_FEES` and `CARD_PROCESSING_FEE = 1.5`, computed client-side and posted as `fee_amount`.
- `supabase/functions/execute-crypto-swap/index.ts:29` — hardcoded `FEE_BPS = 50`.
- `supabase/functions/fx-engine/index.ts:145` — hardcoded `fee_rate = 0.005` plus its own markup resolution.
- `circle-quote` / `initiate-cpn-payout` — separate `cpn_corridors.markup_bps` + client-supplied `platform_fee`.
- `execute-transfer` and `stripe-payout` post whatever `fee_amount` arrives, with no revalidation against the rate card.

Financial statements (`FinancialStatementsPanel.tsx`, `TrialBalancePanel.tsx`) read `ledger_entries` bucketed by GL code prefix only. `transaction_economics` and `partner_invoices` do not feed them at all.

## Part 1 — Consolidate the pricing engine

**1a. Single quote service.** Add `supabase/functions/_shared/pricingService.ts` exporting `quotePrice({ direction, sourceCurrency, destCurrency, destCountry, paymentMethod, customerType, amount })`. It resolves the active `efinmoney_pricing` row and delegates the arithmetic to the existing `routingEngine.computeFee` / `computeCustomerRevenue` — no new math, no new tables.

**1b. Migrate the bypasses onto it.**
- Seed `efinmoney_pricing` rows covering the currently hardcoded cases: Canada delivery methods (interac / eft / card_push / stripe_connect / paylink), crypto swap (0.50%), fx-engine default (0.50%), and each `cpn_corridors` corridor's markup. Migration only moves existing values into the table — no fee changes to customers.
- Retire `cpn_corridors.markup_bps` as a pricing input; keep the column for one release marked deprecated, with `circle-quote` reading the rate card instead.
- Delete the hardcoded constants in `execute-crypto-swap` and `fx-engine`; both call `quotePrice`.
- Replace the client-side fee math in `CanadaSendFlow` with a call to the existing quote endpoint, so the UI displays the server's number rather than computing its own.

**1c. Server-side authority.** `execute-transfer` re-quotes on the server and rejects (or corrects, per config) any `fee_amount` that disagrees with the rate card beyond a tolerance. Client-supplied `platform_fee` in `initiate-cpn-payout` is ignored in favour of the quote.

**1d. Admin surface cleanup.** `PricingSettingsPanel`, `PricingPage`, and `EfinPricingPanel` all read/write `efinmoney_pricing`; consolidate into a single rate-card editor and have the others link to it, so there is one place to change a fee.

## Part 2 — Pricing in the financial statements

**2a. Split revenue at posting time.** Every flow posts fee revenue and FX margin through the same helper, to distinct GL accounts already in the chart: `4200 Transfer Fees`, `4100 FX Gain`, `4300 Crypto Trading Fees`, `4250 Top-up Fee Revenue`. Partner cost posts to `5200 Provider Fees` / `5300 Network Fees` via the existing `ensure_network_fee_account` helper. This makes the income statement break revenue down by pricing component without changing its account-prefix logic.

**2b. New "Pricing & Margin" statement.** Add a tab to `FinancialStatementsPanel` backed by a new SQL function `pricing_margin_statement(p_from, p_to, p_group_by)` that reports, per corridor/partner/method: posted revenue (from `ledger_entries`), modelled revenue and cost (from `transaction_economics`), billed partner cost (from approved `partner_invoices`), and the resulting gross margin — reconciling the three sources side by side.

**2c. Revenue assurance reconciliation.** New function `revenue_assurance_variance(p_from, p_to)` comparing `transaction_economics.total_revenue` against the actual fee-revenue `ledger_entries` per transfer, surfacing any transaction where what was quoted differs from what was booked. Exposed as a variance table under the same tab and, when the variance exceeds a threshold, raised as a `revenue_variance` entry in the existing `partner_alerts` table (no new cron — folded into `partner-alerts-scan`).

**2d. Reports Centre.** Add the Pricing & Margin statement and the variance report to `ReportsCentrePanel` with the existing CSV export path.

## Technical notes

- No customer-visible price changes: the seeding migration copies today's effective values into `efinmoney_pricing`.
- Pricing writes continue to go through versioned inserts (`effective_from`/`effective_to` supersede chain) — no in-place edits, history preserved.
- Double-entry is untouched; new postings split existing revenue between accounts that already exist, so the trial balance stays balanced.
- New SQL functions are `SECURITY DEFINER` gated on `is_pricing_manager()`, matching the existing reporting functions.

## Order

Migration (seed rate card + new report functions) → `pricingService.ts` → migrate the four bypass flows → server-side fee validation in `execute-transfer` → statements tab and hooks → alert type and Reports Centre entries.
