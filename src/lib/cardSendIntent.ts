/**
 * Persist a card-funded send across hosted/in-app collect.
 * After collection succeeds, Send page resumes and pays out from the credited wallet.
 */

export type CardSendProvider = "nomba" | "lenhub" | "paytota" | "swychr" | "flutterwave";

export type CardSendIntent = {
  provider: CardSendProvider;
  nombaTxnId?: string;
  lenhubChargeId?: string;
  lenhubProviderChargeId?: string;
  paytotaTxnId?: string;
  swychrTxnId?: string;
  /** Flutterwave tx_ref from flw-initialize-payment */
  flwTxRef?: string;
  flwTransactionId?: string;
  useLenhubFlutter?: boolean;
  useSwychr?: boolean;
  useFlutterwave?: boolean;
  walletId: string;
  sourceCurrency: string;
  sourceAmount: number;
  targetCountryId: string;
  targetCurrency: string;
  targetAmount: number;
  exchangeRate: number;
  feeAmount: number;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  payoutMethod: string;
  transferType: "bank" | "mobile_money";
  recipientAccount?: string;
  recipientBankCode?: string;
  recipientBankName?: string | null;
  networkId?: string | null;
  ghPayoutMode?: "mobile" | "bank";
  useStellar?: boolean;
  usePawapay?: boolean;
  usePaytota?: boolean;
  useFincra?: boolean;
  recipientCountryHint?: string;
  at: number;
  status: "awaiting_payment" | "consumed";
};

const STORAGE_KEY = "efm_card_send_intent";
const TTL_MS = 60 * 60 * 1000;
const FLW_PENDING_KEY = "efm_flw_card_send_txn";

function inferProvider(intent: Partial<CardSendIntent>): CardSendProvider {
  if (intent.provider) return intent.provider;
  if (intent.nombaTxnId) return "nomba";
  if (intent.lenhubChargeId) return "lenhub";
  if (intent.paytotaTxnId) return "paytota";
  if (intent.swychrTxnId) return "swychr";
  if (intent.flwTxRef) return "flutterwave";
  return "lenhub";
}

export function saveCardSendIntent(
  intent: Omit<CardSendIntent, "at" | "status"> & { status?: CardSendIntent["status"] },
) {
  try {
    const payload: CardSendIntent = {
      ...intent,
      provider: inferProvider(intent),
      status: intent.status ?? "awaiting_payment",
      at: Date.now(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readCardSendIntent(): CardSendIntent | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CardSendIntent;
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    parsed.provider = inferProvider(parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function patchCardSendIntent(patch: Partial<CardSendIntent>) {
  try {
    const cur = readCardSendIntent();
    if (!cur) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...cur, ...patch, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function markCardSendIntentConsumed() {
  try {
    const cur = readCardSendIntent();
    if (!cur) return;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...cur, status: "consumed", at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearCardSendIntent() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function savePendingFlwTxn(txRef: string) {
  try {
    sessionStorage.setItem(FLW_PENDING_KEY, txRef);
  } catch {
    /* ignore */
  }
}

export function readPendingFlwTxn(): string | null {
  try {
    return sessionStorage.getItem(FLW_PENDING_KEY);
  } catch {
    return null;
  }
}

export function clearPendingFlwTxn() {
  try {
    sessionStorage.removeItem(FLW_PENDING_KEY);
  } catch {
    /* ignore */
  }
}
