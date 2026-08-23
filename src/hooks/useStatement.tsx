import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { cleanIncomingTransactionLabel } from "@/lib/incomingTransactions";

export interface StatementRow {
  id: string;
  journalId: string;
  date: string;
  description: string;
  reference: string;
  payee: string;
  purpose: string;
  walletId: string;
  currency: string;
  moneyOut: number;
  moneyIn: number;
  balance: number;
  transferId?: string;
  status: string;
}

const TRANSFER_REF_TYPES = new Set([
  "transfer",
  "internal_transfer",
  "stellar_transfer",
  "cpn_transfer",
  "intra_ca_transfer",
]);

const payeeFromDescription = (desc: string): string | null => {
  const m = desc.match(/(?:Transfer to|Payout to|Paysafe payout to|Payable to|Received from)\s+(.+?)(?:\s*\(|$)/i);
  return m?.[1]?.trim() || null;
};

const refOf = (id: string) =>
  `EFM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const purposeFromTransferType = (t?: string | null, payout?: string | null) => {
  switch (t) {
    case "internal": return "eFinMoney transfer";
    case "mobile_money": return `Mobile money${payout ? ` · ${payout}` : ""}`;
    case "bank": return "Bank payout";
    case "crypto": return "Crypto trade";
    case "bill_payment": return "Bill payment";
    case "domestic_canada": return "Canada domestic transfer";
    default: return "Transfer";
  }
};

const purposeFromRefType = (rt?: string | null) => {
  switch (rt) {
    case "transfer": return "Outgoing transfer";
    case "internal_transfer": return "Received from eFinMoney user";
    case "stellar_transfer": return "Stellar transfer";
    case "stripe_topup":
    case "flw_topup":
    case "manual_topup":
    case "wallet_topup":
    case "nomba_pay_topup":
    case "swychr_payin_topup":
    case "paytota_pay_topup":
      return "Wallet top-up";
    case "fx": return "FX exchange";
    case "crypto_trade": return "Crypto trade";
    case "bill_payment": return "Bill payment";
    case "card_charge": return "Card charge";
    default: return rt ? rt.replace(/_/g, " ") : "Adjustment";
  }
};

export const useStatement = (walletId?: string | null, limit = 500) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["statement", user?.id, walletId ?? "all", limit],
    enabled: !!user,
    queryFn: async (): Promise<StatementRow[]> => {
      // Resolve user wallets
      const { data: walletRows } = await supabase
        .from("wallets")
        .select("id, currency_code")
        .eq("user_id", user!.id);

      const userWalletIds = (walletRows ?? []).map((w) => w.id);
      const targetWalletIds = walletId ? [walletId] : userWalletIds;
      if (targetWalletIds.length === 0) return [];

      // Newest first — previously ordered ascending + limit, which returned the *oldest*
      // N rows and hid recent (e.g. in-flight) transfers once history exceeded the limit.
      const { data: rawEntries, error } = await supabase
        .from("ledger_entries")
        .select(
          "id, journal_id, wallet_id, currency_code, debit_amount, credit_amount, description, reference_type, reference_id, created_at"
        )
        .in("wallet_id", targetWalletIds)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        console.error(error);
        return [];
      }

      // Chronological for running balance within this window
      const entries = [...(rawEntries ?? [])].reverse();

      // Collect transfer ids for joining sender/recipient/purpose
      const transferIds = Array.from(
        new Set(
          entries
            .filter((e) => TRANSFER_REF_TYPES.has(e.reference_type ?? "") && e.reference_id)
            .map((e) => e.reference_id as string)
        )
      );

      let transfersById: Record<string, any> = {};
      if (transferIds.length) {
        const { data: tdata } = await supabase
          .from("transfers")
          .select(
            "id, recipient_name, recipient_country, transfer_type, payout_method, status, sender_id"
          )
          .in("id", transferIds);
        for (const t of tdata ?? []) transfersById[t.id] = t;
      }

      // Running balance per wallet
      const runningByWallet: Record<string, number> = {};

      // Deduplicate by journal_id per wallet (an entry per journal per wallet is fine)
      const rows: StatementRow[] = entries.map((e) => {
        const dbt = Number(e.debit_amount || 0);
        const crd = Number(e.credit_amount || 0);
        // For an asset wallet ledger: credit_amount = money in, debit_amount = money out
        // Use credit - debit as delta when treating wallet as user asset perspective.
        // However in double-entry posting, user wallet (liability/asset) may use opposite signs.
        // Empirically in this project: credit_amount > 0 = funds received, debit_amount > 0 = funds sent.
        const delta = crd - dbt;
        const prev = runningByWallet[e.wallet_id!] ?? 0;
        const balance = prev + delta;
        runningByWallet[e.wallet_id!] = balance;

        const isTransferRef = TRANSFER_REF_TYPES.has(e.reference_type ?? "") && e.reference_id;
        const transfer = isTransferRef ? transfersById[e.reference_id as string] : null;

        const isOutgoing = dbt > 0;
        const rawDescription = e.description?.trim() || "";

        let payee = "—";
        let purpose = purposeFromRefType(e.reference_type);
        let description = rawDescription
          ? cleanIncomingTransactionLabel(rawDescription, e.reference_type)
          : purpose;

        if (transfer) {
          purpose = purposeFromTransferType(transfer.transfer_type, transfer.payout_method);
          if (transfer.sender_id === user!.id) {
            payee = transfer.recipient_name || "Recipient";
            description = `Transfer to ${payee}${transfer.recipient_country ? ` (${transfer.recipient_country})` : ""}`;
          } else {
            payee = transfer.recipient_name || "eFinMoney user";
            description = `Received from ${payee}`;
          }
        } else if (rawDescription) {
          const parsedPayee = payeeFromDescription(rawDescription);
          if (parsedPayee) payee = parsedPayee;
          else if (isOutgoing) payee = "Outflow";
          else payee = "Inflow";
        } else if (isOutgoing) {
          payee = "Outflow";
        } else {
          payee = "Inflow";
        }

        return {
          id: e.id,
          journalId: e.journal_id,
          date: e.created_at,
          description,
          reference: refOf(e.reference_id || e.journal_id || e.id),
          payee,
          purpose,
          walletId: e.wallet_id!,
          currency: e.currency_code,
          moneyOut: dbt,
          moneyIn: crd,
          balance,
          transferId: isTransferRef ? (e.reference_id as string) : undefined,
          status: transfer?.status || "completed",
        };
      });

      // Display newest first
      return rows.reverse();
    },
  });
};
