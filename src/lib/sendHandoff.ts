/** Dashboard quick-send → /send prefill (survives React Strict Mode remounts). */
export type SendHandoffIntent = {
  amount: number;
  from: string;
  to: string;
  recvAmount?: number;
  sourceWalletId?: string;
  fundingSource: "wallet" | "card" | "bank";
  at: number;
};

const STORAGE_KEY = "efm_send_intent";
const TTL_MS = 10 * 60 * 1000;

export const saveSendHandoff = (intent: Omit<SendHandoffIntent, "at">) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...intent, at: Date.now() }));
  } catch {
    /* ignore */
  }
};

export const readSendHandoff = (): SendHandoffIntent | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SendHandoffIntent;
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const clearSendHandoff = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
