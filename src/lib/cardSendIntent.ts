/**
 * Persist a card-funded send across Nomba hosted checkout redirect.
 * After collection succeeds, Send page resumes and pays out from the credited wallet.
 */

export type CardSendIntent = {
  nombaTxnId: string;
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
  useFincra?: boolean;
  recipientCountryHint?: string;
  at: number;
  status: "awaiting_payment" | "consumed";
};

const STORAGE_KEY = "efm_card_send_intent";
const TTL_MS = 60 * 60 * 1000; // 1 hour — checkout can take a while

export function saveCardSendIntent(intent: Omit<CardSendIntent, "at" | "status"> & { status?: CardSendIntent["status"] }) {
  try {
    const payload: CardSendIntent = {
      ...intent,
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
    return parsed;
  } catch {
    return null;
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
