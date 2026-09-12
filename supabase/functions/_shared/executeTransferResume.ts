import { isCanadaCadPayout } from "./nomba-payout-corridors.ts";

/** Statuses where execute-transfer must not re-run payouts. */
export const EXECUTE_TRANSFER_TERMINAL_STATUSES = new Set([
  "completed",
  "failed",
  "reversed",
  "expired",
  "cancelled",
]);

/**
 * True when execute-transfer may continue (ledger skip + payout rails).
 * Blocks terminal states and in-flight processing that already has a provider id.
 */
export function canResumeExecuteTransfer(
  status: string | null | undefined,
  providerReference?: string | null,
): boolean {
  const s = String(status || "").trim().toLowerCase();
  if (!s || EXECUTE_TRANSFER_TERMINAL_STATUSES.has(s)) return false;
  if (s === "processing" && String(providerReference || "").trim()) return false;
  return (
    s === "initiated"
    || s === "funded"
    || s === "pending_ops"
    || s === "pending_liquidity"
    || s === "processing"
  );
}

/** Canada CAD transfers the treasury worker should retry (wallet already taken). */
export function isStuckCanadaCadTransfer(t: {
  status?: string | null;
  provider_reference?: string | null;
  source_currency?: string | null;
  target_currency?: string | null;
  recipient_country?: string | null;
  payout_method?: string | null;
  transfer_type?: string | null;
}): boolean {
  const status = String(t.status || "").toLowerCase();
  if (status === "initiated") return false;
  if (!canResumeExecuteTransfer(t.status, t.provider_reference)) return false;
  return isCanadaCadPayout({
    currency: t.target_currency,
    country: t.recipient_country,
    method: t.payout_method,
    transferType: t.transfer_type,
    sourceCurrency: t.source_currency,
  });
}
