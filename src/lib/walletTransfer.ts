import { resolveEffectiveRate } from "@/lib/fxRatesCore";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";

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
