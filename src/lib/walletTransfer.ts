import { resolveEffectiveRate } from "@/lib/fxRatesCore";
import { supabase } from "@/integrations/supabase/client";
import { edgeFunctionErrorMessage, invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export const WALLET_TRANSFER_FEE_RATE = 0.005;

export type FxRateRow = {
  from_currency: string;
  to_currency: string;
  rate: number;
  markup_rate: number;
  effective_rate: number;
};

export function findEffectiveRate(
  rates: FxRateRow[] | undefined,
  from: string,
  to: string,
): { effective_rate: number; fee_rate: number } | null {
  if (from === to) return { effective_rate: 1, fee_rate: 0 };

  const resolved = rates?.length ? resolveEffectiveRate(from, to, rates) : null;
  if (resolved && resolved > 0) {
    return { effective_rate: resolved, fee_rate: WALLET_TRANSFER_FEE_RATE };
  }

  return null;
}

export function computeTransferQuote(
  fromAmount: number,
  from: string,
  to: string,
  rates: FxRateRow[] | undefined,
) {
  const rateInfo = findEffectiveRate(rates, from, to);
  if (!rateInfo || fromAmount <= 0) {
    return { fee: 0, receive: 0, effective_rate: null as number | null, fee_rate: 0 };
  }
  const fee = fromAmount * rateInfo.fee_rate;
  const receive = (fromAmount - fee) * rateInfo.effective_rate;
  return {
    fee,
    receive,
    effective_rate: rateInfo.effective_rate,
    fee_rate: rateInfo.fee_rate,
  };
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
    m.includes("service temporarily unavailable")
  );
}

/**
 * Execute a wallet FX swap via fx-engine. If the deployed engine still rejects
 * live (valid_until) rates, complete the same swap through execute_fx_swap using
 * the rate already shown in the UI.
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
    if (error) {
      throw new Error(error.message || message);
    }
    return { success: true };
  }
}
