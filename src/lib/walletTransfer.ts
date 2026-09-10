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
    m.includes("service temporarily unavailable") ||
    m.includes("account_id") ||
    m.includes("null value") ||
    m.includes("not set up for live exchange")
  );
}

function isMissingLedgerAccount(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("account_id") ||
    m.includes("null value") ||
    m.includes("ledger account not found") ||
    m.includes("not set up for live exchange")
  );
}

async function ensureCustomerWalletLiability(currency: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("ensure_customer_wallet_liability", {
    p_ccy: currency,
  });
  if (error || !data) return null;
  return String(data);
}

async function resolveSwapAccountId(currency: string): Promise<string | null> {
  const ensured = await ensureCustomerWalletLiability(currency);
  if (ensured) return ensured;

  const { data: rows } = await supabase
    .from("ledger_accounts")
    .select("id, code, name")
    .eq("currency_code", currency)
    .eq("is_active", true)
    .like("code", "21%")
    .limit(20);
  const preferred =
    rows?.find((a) => /customer wallet/i.test(a.name)) ?? rows?.[0];
  if (preferred?.id) return preferred.id;

  const { data: clearing } = await supabase.rpc("ensure_fx_clearing_account", {
    p_ccy: currency,
  });
  return clearing ? String(clearing) : null;
}

async function postFxSwapLedger(input: ExecuteWalletFxSwapInput & { userId: string }): Promise<string> {
  const rate = Number(input.effective_rate);
  const fee = Number(input.fee_amount ?? 0);
  const toAmount = (input.from_amount - fee) * rate;
  if (!Number.isFinite(toAmount) || toAmount <= 0) {
    throw new Error("Invalid exchange amount after fees.");
  }

  const [fromAccountId, toAccountId, feeRow] = await Promise.all([
    resolveSwapAccountId(input.from_currency),
    resolveSwapAccountId(input.to_currency),
    supabase.from("ledger_accounts").select("id").eq("code", "4100").maybeSingle(),
  ]);

  if (!fromAccountId || !toAccountId) {
    throw new Error(
      `Ledger account not found for ${!fromAccountId ? input.from_currency : input.to_currency}`,
    );
  }

  const journalId = crypto.randomUUID();
  const rows: Array<{
    journal_id: string;
    account_id: string;
    wallet_id: string | null;
    currency_code: string;
    debit_amount: number;
    credit_amount: number;
    description: string;
    reference_type: string;
    created_by: string;
  }> = [
    {
      journal_id: journalId,
      account_id: fromAccountId,
      wallet_id: input.from_wallet_id,
      currency_code: input.from_currency,
      debit_amount: input.from_amount,
      credit_amount: 0,
      description: "FX Swap - Debit",
      reference_type: "fx",
      created_by: input.userId,
    },
    {
      journal_id: journalId,
      account_id: toAccountId,
      wallet_id: input.to_wallet_id,
      currency_code: input.to_currency,
      debit_amount: 0,
      credit_amount: toAmount,
      description: "FX Swap - Credit",
      reference_type: "fx",
      created_by: input.userId,
    },
  ];

  const feeAccountId = feeRow.data?.id;
  if (fee > 0 && feeAccountId) {
    rows.push({
      journal_id: journalId,
      account_id: feeAccountId,
      wallet_id: null,
      currency_code: input.from_currency,
      debit_amount: 0,
      credit_amount: fee,
      description: "FX Fee Revenue",
      reference_type: "fx",
      created_by: input.userId,
    });
  }

  const { error } = await supabase.from("ledger_entries").insert(rows);
  if (error) throw new Error(error.message);
  return journalId;
}

/**
 * Execute a wallet FX swap via fx-engine. If the deployed engine still rejects
 * live rates or a missing USDC/USDT liability account_id, complete the swap
 * with execute_fx_swap / a ledger post using a resolved account id.
 */
export async function executeWalletFxSwap(input: ExecuteWalletFxSwapInput): Promise<unknown> {
  await Promise.all([
    ensureCustomerWalletLiability(input.from_currency),
    ensureCustomerWalletLiability(input.to_currency),
  ]);

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
    const userId = sessionData.user.id;

    const { error } = await supabase.rpc("execute_fx_swap", {
      p_user_id: userId,
      p_from_wallet_id: input.from_wallet_id,
      p_to_wallet_id: input.to_wallet_id,
      p_from_amount: input.from_amount,
      p_effective_rate: rate,
      p_fee_amount: input.fee_amount ?? 0,
    });
    if (!error) return { success: true };

    const rpcMessage = error.message || message;
    if (!isMissingLedgerAccount(rpcMessage) && !isMissingLedgerAccount(message)) {
      throw new Error(rpcMessage);
    }

    const journalId = await postFxSwapLedger({ ...input, userId });
    return { success: true, journal_id: journalId };
  }
}
