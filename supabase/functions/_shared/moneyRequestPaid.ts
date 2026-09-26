/** Mark a money_request paid after a successful wallet credit (idempotent). */

export async function markMoneyRequestPaid(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    moneyRequestId?: string | null;
    walletId?: string | null;
    amount?: number | null;
    currency?: string | null;
    /** Match open requests on this wallet within ±tolerance of amount. */
    matchOpenByWalletAmount?: boolean;
  },
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const id = String(opts.moneyRequestId || "").trim();

  if (id && /^[0-9a-f-]{36}$/i.test(id)) {
    const { data, error } = await admin
      .from("money_requests")
      .update({ status: "paid", paid_at: nowIso, updated_at: nowIso })
      .eq("id", id)
      .in("status", ["pending", "awaiting_payment"])
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("markMoneyRequestPaid by id failed", error.message);
      return false;
    }
    return !!data;
  }

  if (!opts.matchOpenByWalletAmount) return false;
  const walletId = String(opts.walletId || "").trim();
  const amount = Number(opts.amount);
  const currency = String(opts.currency || "").toUpperCase();
  if (!walletId || !Number.isFinite(amount) || amount <= 0 || !currency) return false;

  const { data: open } = await admin
    .from("money_requests")
    .select("id, amount")
    .eq("requester_wallet_id", walletId)
    .eq("currency", currency)
    .in("status", ["pending", "awaiting_payment"])
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(20);

  const match = (open ?? []).find((r: { amount: number }) => Math.abs(Number(r.amount) - amount) < 0.02);
  if (!match) return false;

  const { data, error } = await admin
    .from("money_requests")
    .update({ status: "paid", paid_at: nowIso, updated_at: nowIso })
    .eq("id", match.id)
    .in("status", ["pending", "awaiting_payment"])
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("markMoneyRequestPaid by wallet/amount failed", error.message);
    return false;
  }
  return !!data;
}

export const LIVE_REQUEST_MONEY_CURRENCIES = ["NGN", "GHS", "KES", "ZMW", "CAD", "USD"] as const;

export function isLiveRequestMoneyCurrency(code: string): boolean {
  return (LIVE_REQUEST_MONEY_CURRENCIES as readonly string[]).includes(String(code || "").toUpperCase());
}

export function payMethodsForCurrency(currency: string): string[] {
  const c = String(currency || "").toUpperCase();
  // Nomba card/EFT first (same ranking as wallet top-up), then Fincra Interac Autodeposit.
  if (c === "CAD") return ["nomba", "interac"];
  if (c === "NGN" || c === "GHS") return ["bank_va", "checkout"];
  if (c === "USD" || c === "KES" || c === "ZMW") return ["checkout"];
  return [];
}

export function minRequestAmount(currency: string): number {
  const c = String(currency || "").toUpperCase();
  if (c === "NGN") return 100;
  if (c === "KES" || c === "ZMW" || c === "GHS") return 10;
  if (c === "CAD" || c === "USD") return 2;
  return 2;
}
