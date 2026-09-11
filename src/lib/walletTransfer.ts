import { resolveEffectiveRate } from "@/lib/fxRatesCore";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage, invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { invertSendAmount, quoteTransfer, type TransferQuote } from "@/lib/pricing/costRecoveryEngine";
import type { RateRow } from "@/lib/fxRatesCore";

export type FxRateRow = {
  from_currency: string;
  to_currency: string;
  rate: number;
  markup_rate: number;
  effective_rate: number;
};

function midMarketRows(rates: FxRateRow[] | undefined): RateRow[] {
  return (rates ?? []).map((r) => ({
    from_currency: r.from_currency,
    to_currency: r.to_currency,
    effective_rate: Number(r.rate) > 0 ? Number(r.rate) : Number(r.effective_rate),
  }));
}

export function findMidMarketRate(
  rates: FxRateRow[] | undefined,
  from: string,
  to: string,
): number | null {
  if (from === to) return 1;
  const resolved = rates?.length ? resolveEffectiveRate(from, to, midMarketRows(rates)) : null;
  return resolved && resolved > 0 ? resolved : null;
}

/** @deprecated Use quoteWalletTransfer. Kept as the mid-market lookup. */
export function findEffectiveRate(
  rates: FxRateRow[] | undefined,
  from: string,
  to: string,
): { effective_rate: number; fee_rate: number } | null {
  const mid = findMidMarketRate(rates, from, to);
  if (mid == null) return null;
  const quoted = quoteTransfer({
    sourceCurrency: from,
    destinationCurrency: to,
    amount: 100,
    channel: "wallet",
    payoutMethod: "WALLET_TO_WALLET",
    midMarketRate: mid,
  });
  return { effective_rate: quoted.customerRate ?? mid, fee_rate: quoted.transferFeePct };
}

export function quoteWalletTransfer(
  fromAmount: number,
  from: string,
  to: string,
  rates: FxRateRow[] | undefined,
): TransferQuote {
  const mid = findMidMarketRate(rates, from, to);
  return quoteTransfer({
    sourceCurrency: from,
    destinationCurrency: to,
    amount: fromAmount,
    channel: "wallet",
    payoutMethod: "WALLET_TO_WALLET",
    midMarketRate: mid,
  });
}

export function computeTransferQuote(
  fromAmount: number,
  from: string,
  to: string,
  rates: FxRateRow[] | undefined,
) {
  const quoted = quoteWalletTransfer(fromAmount, from, to, rates);
  return {
    fee: quoted.transferFee,
    receive: quoted.youReceive ?? 0,
    effective_rate: quoted.customerRate,
    fee_rate: quoted.transferFeePct,
    quote: quoted,
  };
}

export function invertWalletSendAmount(
  receiveAmount: number,
  from: string,
  to: string,
  rates: FxRateRow[] | undefined,
): number {
  const mid = findMidMarketRate(rates, from, to);
  return invertSendAmount(receiveAmount, {
    sourceCurrency: from,
    destinationCurrency: to,
    channel: "wallet",
    payoutMethod: "WALLET_TO_WALLET",
    midMarketRate: mid,
  });
}

export async function invokeTransferError(error: unknown): Promise<string> {
  return edgeFunctionErrorMessage(error);
}

export type ExecuteWalletFxSwapInput = {
  from_wallet_id: string;
  to_wallet_id: string;
  from_currency: string;
  to_currency: string;
  from_amount: number;
  effective_rate?: number | null;
  fee_amount?: number;
};

function canUseQuotedRateFallback(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("not available") ||
    m.includes("non-2xx") ||
    m.includes("edge function") ||
    m.includes("temporarily unavailable") ||
    m.includes("failed to execute transfer") ||
    m.includes("service temporarily unavailable") ||
    m.includes("account_id") ||
    m.includes("null value") ||
    m.includes("not set up for live exchange") ||
    m.includes("row-level security") ||
    m.includes("ledger_entries")
  );
}

/**
 * Execute a wallet FX swap via fx-engine, then execute_fx_swap (SECURITY DEFINER).
 * Ledger writes must go through the RPC so they are not blocked by consumer RLS.
 */
export async function executeWalletFxSwap(input: ExecuteWalletFxSwapInput): Promise<unknown> {
  try {
    return await invokeEdgeFunction("fx-engine", {
      action: "execute",
      from_wallet_id: input.from_wallet_id,
      to_wallet_id: input.to_wallet_id,
      from_currency: input.from_currency,
      to_currency: input.to_currency,
      from_amount: input.from_amount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "");
    const rate = Number(input.effective_rate);
    if (!canUseQuotedRateFallback(message) || !Number.isFinite(rate) || rate <= 0) {
      throw err;
    }

    const { data: sessionData, error: userError } = await supabase.auth.getUser();
    if (userError || !sessionData.user) throw err;

    const { error } = await supabase.rpc("execute_fx_swap", {
      p_user_id: sessionData.user.id,
      p_from_wallet_id: input.from_wallet_id,
      p_to_wallet_id: input.to_wallet_id,
      p_from_amount: input.from_amount,
      p_effective_rate: rate,
      p_fee_amount: input.fee_amount ?? 0,
    });
    if (error) throw new Error(error.message || message);
    return { success: true };
  }
}
