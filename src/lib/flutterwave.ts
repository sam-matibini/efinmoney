// Flutterwave currency / payment-method rules helper
// Centralized so all places that open a Flutterwave checkout follow the same rules.

import { supabase } from "@/integrations/supabase/client";

export type FlwMethod = "card" | "mobilemoney" | "banktransfer" | "ussd";

// Mobile money: always charge in destination's local currency
export const MOBILE_MONEY_CURRENCY: Record<string, string> = {
  NG: "NGN",
  KE: "KES",
  GH: "GHS",
  UG: "UGX",
  TZ: "TZS",
  RW: "RWF",
  ZM: "ZMW",
  CM: "XAF",
  SN: "XOF",
  CI: "XOF",
  BF: "XOF",
  ML: "XOF",
  SL: "SLE",
  LR: "LRD",
  MW: "MWK",
  BI: "BIF",
};

// Bank transfer: destination local currency
export const BANK_TRANSFER_CURRENCY: Record<string, string> = {
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  CA: "CAD",
  GB: "GBP",
  US: "USD",
};

// Card: NGN if wallet is NGN, otherwise USD
export const cardChargeCurrency = (walletCurrency: string): "NGN" | "USD" =>
  walletCurrency === "NGN" ? "NGN" : "USD";

// USSD only NGN
export const USSD_CURRENCY = "NGN";

// Allowed top-up currencies per method (for UI selectors)
export const ALLOWED_TOPUP_CURRENCIES: Record<FlwMethod, string[]> = {
  card: ["USD", "NGN"],
  mobilemoney: ["KES", "UGX", "GHS", "TZS", "ZMW", "RWF", "NGN"],
  banktransfer: ["NGN", "GHS", "KES", "CAD", "GBP", "USD"],
  ussd: ["NGN"],
};

// Flutterwave minimum amounts per currency
export const MIN_AMOUNTS: Record<string, number> = {
  NGN: 100,
  KES: 10,
  GHS: 1,
  USD: 1,
  UGX: 500,
  TZS: 1000,
  ZMW: 5,
  RWF: 500,
  XAF: 500,
  XOF: 500,
  SLE: 1000,
  LRD: 500,
  MWK: 500,
  BIF: 500,
  CAD: 1,
  GBP: 1,
  EUR: 1,
  ZAR: 10,
};

export const minAmount = (currency: string) => MIN_AMOUNTS[currency] ?? 1;

export const validateMinAmount = (currency: string, amount: number): string | null => {
  const min = minAmount(currency);
  if (amount < min) return `Minimum amount is ${min} ${currency}`;
  return null;
};

// Look up a current FX rate (from_currency -> to_currency) and return the
// effective rate; returns null when no rate is available.
const directRate = async (from: string, to: string): Promise<number | null> => {
  const { data, error } = await supabase
    .from("fx_rates")
    .select("rate, effective_rate")
    .eq("from_currency", from)
    .eq("to_currency", to)
    .or("valid_until.is.null,valid_until.gt." + new Date().toISOString())
    .order("valid_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return Number(data.effective_rate || data.rate) || null;
};

export const fetchFxRate = async (from: string, to: string): Promise<number | null> => {
  if (from === to) return 1;
  // Try direct rate first
  const direct = await directRate(from, to);
  if (direct) return direct;
  // Cross-rate via USD (e.g. NGN -> USD -> GHS)
  if (from !== "USD" && to !== "USD") {
    const [a, b] = await Promise.all([directRate(from, "USD"), directRate("USD", to)]);
    if (a && b) return a * b;
    // Try inverse legs if one direction is missing
    const [aInv, bInv] = await Promise.all([
      a ? Promise.resolve(null) : directRate("USD", from),
      b ? Promise.resolve(null) : directRate(to, "USD"),
    ]);
    const fromUsd = a ?? (aInv ? 1 / aInv : null);
    const usdTo = b ?? (bInv ? 1 / bInv : null);
    if (fromUsd && usdTo) return fromUsd * usdTo;
  }
  // Try inverse direct
  const inv = await directRate(to, from);
  if (inv) return 1 / inv;
  return null;
};

// Map a raw error / message into a friendly user-facing string. Specifically
// catches the "invalid currency for authmodel" Flutterwave error.
export const friendlyFlwError = (error: unknown, currency?: string): string => {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (error as { message?: string; status?: string })?.message ||
          (error as { status?: string })?.status ||
          "";
  const msg = String(raw).toLowerCase();
  if (msg.includes("invalid currency") && msg.includes("authmodel")) {
    return `This payment method is not available for ${currency || "this currency"}. Please try a different payment method or wallet.`;
  }
  return raw || "Payment failed";
};

// V4: No public key. All payments are initiated via the `flw-initialize-payment`
// edge function which returns either a hosted `payment_link` (cards/USSD/bank
// transfer) or a `next_action` (mobile-money USSD prompt).
export interface FlwInitResult {
  success: boolean;
  error?: string;
  payment_link?: string | null;
  reference: string;
  charge_id?: string;
  next_action?: any;
  message?: string;
  stk_push?: boolean;
  status?: string;
  transient?: boolean;
  fallback?: boolean;
  provider_status?: number;
  api?: string;
}

export const initializeFlwPayment = async (params: {
  amount: number;
  currency: string;
  paymentMethod: "card" | "mobilemoney" | "banktransfer" | "ussd";
  redirectUrl: string;
  phone?: string;
  network?: string;
  country?: string;
  walletId?: string;
}): Promise<FlwInitResult> => {
  const { data, error } = await supabase.functions.invoke("flw-initialize-payment", { body: params });
  if (error) throw new Error(error.message || "Failed to initialize payment");
  if (!data?.success) throw new Error(data?.error || "Failed to initialize payment");
  return data as FlwInitResult;
};

/** Verify + credit after hosted checkout return (used by Top Up and card-send resume). */
export async function verifyFlwPayment(params: {
  transaction_id?: string;
  tx_ref?: string;
}): Promise<{
  verified: boolean;
  currency?: string;
  amount?: number;
  error?: string;
  status?: string;
  /** True when the pay-in was credited to the wallet ledger. */
  wallet_funded?: boolean;
  credited?: boolean;
  already?: boolean;
}> {
  const session = (await supabase.auth.getSession()).data.session;
  const qs = new URLSearchParams();
  if (params.transaction_id) qs.set("transaction_id", params.transaction_id);
  if (params.tx_ref) qs.set("tx_ref", params.tx_ref);
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/flw-verify-payment?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session?.access_token || ""}` },
  });
  const json = await res.json().catch(() => ({}));
  return json as {
    verified: boolean;
    currency?: string;
    amount?: number;
    error?: string;
    status?: string;
    wallet_funded?: boolean;
    credited?: boolean;
    already?: boolean;
  };
}
