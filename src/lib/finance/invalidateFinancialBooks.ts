import type { QueryClient } from "@tanstack/react-query";

/** Query keys that CoA, TB, statements, GL and reports centre read. */
export const FINANCIAL_BOOK_QUERY_KEYS = [
  "chart-of-accounts",
  "account-balances",
  "trial-balance",
  "trial-balance-currencies",
  "financial-statements",
  "financial-statements-comparison",
  "ledger-entries",
  "ledger-accounts",
  "ledger-accounts-active",
  "ledger-fx",
  "reports-summary",
  "pl-report",
  "aging-report",
  "cash-flow-statement",
  "general-ledger",
] as const;

/** After a priced checkout, journal or FX swap posts, refresh every financial report. */
export function invalidateFinancialBooks(queryClient: QueryClient) {
  for (const key of FINANCIAL_BOOK_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}
