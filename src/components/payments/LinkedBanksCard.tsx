import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  Building2,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFundingSources } from "@/hooks/useFundingSources";
import { useWallets } from "@/hooks/useWallets";
import { useProfile } from "@/hooks/useProfile";
import { useKyb } from "@/hooks/useKyb";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { useCreateWallet } from "@/hooks/useCreateWallet";
import { useVirtualAccounts, useCreateVirtualAccount } from "@/hooks/useVirtualAccounts";
import { usePinGate } from "@/components/send/usePinGate";
import { getCorridorBanks, resolveCorridorAccount } from "@/lib/flovide";
import { PLAID_COUNTRIES, bankSchemaForCountry, validateBankFields } from "@/lib/bankFieldSchemas";
import { retailPayoutFeeNative } from "@/lib/retailPayoutFees";
import {
  CORRIDOR_BANK_COUNTRIES,
  COUNTRY_TO_CURRENCY,
  CURRENCY_TO_COUNTRY,
  LINK_COUNTRIES,
  type LinkedBank,
  lastFourOf,
  payoutSpecFor,
  canPlaidDebit,
  shouldFundFromSourceBank,
} from "@/lib/linkedBank";
import {
  formatLiveBankLine,
  isPlaidBalanceStale,
  preferredLiveBalance,
} from "@/lib/plaidLiveBalance";
import { LOOP_CAD_INTERAC_ALIAS, LOOP_CAD_EFT, formatLoopEftLines } from "@/lib/loopCad";
import BankPayInInstructions, { type PayInInstructions } from "@/components/payments/BankPayInInstructions";
import type { NigeriaBank } from "@/lib/nombaNigeria";

const fmt = (n: number, ccy: string) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

function loopEftFields(raw: unknown): { label: string; value: string }[] {
  const o = raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
  return formatLoopEftLines({
    bankNumber: o.bankNumber || LOOP_CAD_EFT.bankNumber,
    transitNumber: o.transitNumber || LOOP_CAD_EFT.transitNumber,
    accountNumber: o.accountNumber || LOOP_CAD_EFT.accountNumber,
  }).map((line) => {
    const idx = line.indexOf(": ");
    return idx === -1
      ? { label: "EFT", value: line }
      : { label: line.slice(0, idx), value: line.slice(idx + 2) };
  });
}

type Mode = "closed" | "add" | "withdraw" | "pay" | "topup" | "plaidCountry" | "instructions";

export default function LinkedBanksCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: savedBanks = [], isLoading: loadingSaved } = useFundingSources("bank");
  const { data: wallets = [] } = useWallets();
  const { data: profile } = useProfile();
  const { business } = useKyb();
  const { data: virtualAccounts = [] } = useVirtualAccounts();
  const createWallet = useCreateWallet();
  const createVa = useCreateVirtualAccount();
  const createTransfer = useCreateTransfer();
  const { requirePin, pinGate } = usePinGate();

  const [mode, setMode] = useState<Mode>("closed");
  const [active, setActive] = useState<LinkedBank | null>(null);
  const [payTo, setPayTo] = useState<LinkedBank | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const [country, setCountry] = useState("NG");
  const [banks, setBanks] = useState<NigeriaBank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payIn, setPayIn] = useState<PayInInstructions | null>(null);
  const autoRefreshed = useRef(false);

  const isBusiness = !!business;
  const kycOk =
    profile?.kyc_status === "approved" || profile?.kyc_status === "verified";
  const kybOk = business?.kyb_status === "approved";
  const canMoveMoney = isBusiness ? kybOk : kycOk;

  const { data: plaidAccounts = [] } = useQuery({
    queryKey: ["plaid_accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("plaid_accounts")
        .select(
          "id,name,mask,subtype,account_number,institution_number,branch_number,currency_code,available_balance,current_balance,balances_iso_currency,balances_updated_at,plaid_items(institution_name,status)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const linked = useMemo<LinkedBank[]>(() => {
    const rows: LinkedBank[] = [];
    const seen = new Set<string>();
    for (const a of plaidAccounts) {
      const inst =
        (a.plaid_items as { institution_name?: string; status?: string } | null)?.institution_name || "Bank";
      const itemStatus = (a.plaid_items as { status?: string } | null)?.status;
      const ccy = String(a.balances_iso_currency || a.currency_code || "CAD").toUpperCase();
      const key = `plaid:${a.id}`;
      seen.add(`${inst}|${a.mask}`);
      rows.push({
        id: key,
        source: "plaid",
        currency: ccy,
        country: ccy === "USD" ? "US" : "CA",
        institution: inst,
        lastFour: a.mask || lastFourOf(a.account_number || ""),
        displayName: `${a.name} ····${a.mask || ""}`,
        accountName: a.name,
        details: {
          bank_name: inst,
          account_number: a.account_number || "",
          institution_number: a.institution_number || "",
          transit_number: a.branch_number || "",
          branch_number: a.branch_number || "",
          routing_number: ccy === "USD" ? a.institution_number || "" : "",
        },
        liveAvailable: a.available_balance,
        liveCurrent: a.current_balance,
        liveCurrency: a.balances_iso_currency || a.currency_code,
        liveUpdatedAt: a.balances_updated_at,
        needsReconnect: itemStatus === "login_required",
        plaidAccountId: a.id,
      });
    }
    for (const b of savedBanks) {
      const inst = b.institution || "Bank";
      const key = `${inst.toLowerCase()}|${b.last_four}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const details = (b.details || {}) as Record<string, string>;
      const ccy = (b.currency_code || "NGN").toUpperCase();
      const country = (b.country_code || CURRENCY_TO_COUNTRY[ccy] || "NG").toUpperCase().slice(0, 2);
      rows.push({
        id: b.id,
        source: "saved",
        currency: ccy,
        country,
        institution: inst,
        lastFour: b.last_four,
        displayName: b.display_name,
        accountName: details.account_name || inst,
        details,
      });
    }
    return rows;
  }, [plaidAccounts, savedBanks]);

  const currency = COUNTRY_TO_CURRENCY[country] || "NGN";
  const schema = bankSchemaForCountry(country);
  const corridor = CORRIDOR_BANK_COUNTRIES.has(country);
  const plaidOk = PLAID_COUNTRIES.has(country);
  const hasPlaid = linked.some((b) => b.source === "plaid");

  useEffect(() => {
    if (mode !== "add" || !corridor) {
      setBanks([]);
      return;
    }
    let cancelled = false;
    void getCorridorBanks(currency).then(({ banks: list }) => {
      if (!cancelled) setBanks(list);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, corridor, currency]);

  useEffect(() => {
    if (!corridor || accountNumber.length < 8 || !bankCode) {
      setResolvedName(null);
      return;
    }
    const t = window.setTimeout(() => {
      setResolving(true);
      void resolveCorridorAccount(accountNumber, bankCode, currency)
        .then((r) => {
          if (r.resolved && r.account_name) setResolvedName(r.account_name);
          else setResolvedName(null);
        })
        .catch(() => setResolvedName(null))
        .finally(() => setResolving(false));
    }, 450);
    return () => window.clearTimeout(t);
  }, [corridor, accountNumber, bankCode, currency]);

  const startPlaid = useCallback(async (codes?: string[]) => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token", {
        body: { country_codes: codes?.length ? codes : ["CA", "US"] },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start bank linking");
    } finally {
      setLinking(false);
    }
  }, []);

  const refreshBalances = useCallback(async (force = false) => {
    if (!user) return;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-refresh-balances", {
        body: { force },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const reconnect = (data?.errors || []).filter((e: { needs_reconnect?: boolean }) => e.needs_reconnect);
      if (reconnect.length) {
        toast.error(
          `Reconnect ${reconnect.map((e: { institution?: string | null }) => e.institution || "your bank").join(", ")} with Plaid to keep live balances.`,
        );
      } else if (force && data?.refreshed > 0) {
        toast.success("Bank balances updated");
      }
      void qc.invalidateQueries({ queryKey: ["plaid_accounts", user.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not refresh bank balances");
    } finally {
      setRefreshing(false);
    }
  }, [qc, user]);

  const onPlaidSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { name?: string } }) => {
      try {
        const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
          body: { public_token, institution: metadata.institution },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Bank linked — fetching live balance");
        void qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });
        autoRefreshed.current = false;
        setMode("closed");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not link bank");
      } finally {
        setLinkToken(null);
      }
    },
    [qc, user?.id],
  );

  const { open, ready } = usePlaidLink({ token: linkToken || "", onSuccess: onPlaidSuccess });
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  useEffect(() => {
    if (!user || !hasPlaid || autoRefreshed.current) return;
    const stale = linked.some(
      (b) => b.source === "plaid" && isPlaidBalanceStale(b.liveUpdatedAt),
    );
    if (!stale) return;
    autoRefreshed.current = true;
    void refreshBalances(false);
  }, [user, hasPlaid, linked, refreshBalances]);

  const resetAdd = () => {
    setBankCode("");
    setAccountNumber("");
    setResolvedName(null);
    setManual({});
  };

  const saveBank = async () => {
    if (!user) return;
    const details: Record<string, string> = {};
    let display = "";
    let lastFour = "0000";
    let accountName = "";

    if (corridor) {
      if (!bankCode || !accountNumber.trim()) {
        toast.error("Select a bank and enter the account number.");
        return;
      }
      const bank = banks.find((b) => b.code === bankCode);
      details.bank_name = bank?.name || "";
      details.bank_code = bankCode;
      details.account_number = accountNumber.replace(/\D/g, "");
      if (resolvedName) details.account_name = resolvedName;
      accountName = resolvedName || details.bank_name;
      lastFour = lastFourOf(details.account_number);
      display = `${details.bank_name} ····${lastFour}`;
    } else {
      const found = validateBankFields(schema, manual);
      if (Object.values(found).some(Boolean)) {
        toast.error(Object.values(found).find(Boolean) || "Check the bank details.");
        return;
      }
      for (const f of schema.fields) {
        const v = (manual[f.key] ?? "").trim();
        if (v) details[f.key] = v;
      }
      lastFour = lastFourOf(details.account_number || details.iban || "");
      accountName = details.bank_name || "Bank";
      display = `${accountName} ····${lastFour}`;
    }

    setBusy(true);
    try {
      const { error } = await supabase.from("linked_funding_sources").insert({
        user_id: user.id,
        source_type: "bank",
        display_name: display,
        institution: details.bank_name || accountName,
        last_four: lastFour,
        currency_code: currency,
        country_code: country,
        details,
      });
      if (error) throw error;
      toast.success("Bank linked");
      void qc.invalidateQueries({ queryKey: ["linked_funding_sources"] });
      resetAdd();
      setMode("closed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save bank");
    } finally {
      setBusy(false);
    }
  };

  const removeBank = async (bank: LinkedBank) => {
    if (bank.source !== "saved") return;
    try {
      const { error } = await supabase
        .from("linked_funding_sources")
        .update({ is_active: false })
        .eq("id", bank.id);
      if (error) throw error;
      toast.success("Bank removed");
      void qc.invalidateQueries({ queryKey: ["linked_funding_sources"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove bank");
    }
  };

  const walletFor = (ccy: string) =>
    wallets.find((w) => String(w.currency_code).toUpperCase() === ccy.toUpperCase());

  const ensureWalletId = async (ccy: string): Promise<string> => {
    const existing = walletFor(ccy);
    if (existing) return existing.wallet_id;
    const created = await createWallet.mutateAsync(ccy);
    return created.id;
  };

  const vaFor = (ccy: string) =>
    virtualAccounts.find(
      (a) => a.status === "active" && String(a.currency_code).toUpperCase() === ccy.toUpperCase(),
    );

  const showPayIn = (data: PayInInstructions) => {
    setPayIn(data);
    setMode("instructions");
  };

  const runBankFundedCad = async (from: LinkedBank, to: LinkedBank, parsed: number, fee: number) => {
    const spec = payoutSpecFor(to);
    const walletId = await ensureWalletId(to.currency);
    const transfer = await createTransfer.mutateAsync({
      sender_wallet_id: walletId,
      recipient_name: spec.recipientName,
      recipient_account: spec.recipientAccount,
      recipient_bank_code: spec.recipientBankCode || undefined,
      recipient_bank_name: spec.recipientBankName || undefined,
      recipient_country: spec.recipientCountry,
      transfer_type: "bank",
      payout_method: spec.payoutMethod,
      source_currency: to.currency,
      target_currency: to.currency,
      source_amount: parsed,
      target_amount: parsed,
      exchange_rate: 1,
      fee_amount: fee,
      funding_source: "bank",
    });
    const { data, error } = await supabase.functions.invoke("intra-ca-transfer-create", {
      body: {
        plaid_account_id: from.plaidAccountId,
        destination_wallet_id: walletId,
        amount_cad: parsed + fee,
        description: `Company bank move ${from.institution} → ${to.institution}`,
        purpose: "transfer",
        transfer_id: transfer.id,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    showPayIn({
      heading: "Send from the source bank — not the wallet",
      description: `Pay CAD from ${from.institution} ····${from.lastFour} to Loop Bank. When the deposit matches, we pay ${to.institution} ····${to.lastFour} automatically. You do not need a pre-funded CAD wallet.`,
      fromBank: `${from.institution} ····${from.lastFour}`,
      reference: data.reference,
      fields: [
        { label: "Interac Autodeposit", value: data.loop_alias || LOOP_CAD_INTERAC_ALIAS },
        ...loopEftFields(data.loop_eft),
      ],
      note: data.message || "Include the payment reference in the Interac message or EFT memo.",
    });
  };

  const runPayout = async (from: LinkedBank, to: LinkedBank) => {
    const spec = payoutSpecFor(to);
    if (!spec.canPayout) {
      toast.error(spec.reason || "This corridor isn't available yet.");
      return;
    }
    if (from.currency !== to.currency) {
      toast.error("In-country transfers stay in the same currency. Use Send for FX.");
      return;
    }
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    const fee = retailPayoutFeeNative(to.currency)?.amount ?? 0;
    const total = parsed + fee;
    const bankFunded = shouldFundFromSourceBank(from, to) && from.currency === "CAD";

    if (bankFunded) {
      setBusy(true);
      try {
        await runBankFundedCad(from, to, parsed, fee);
        setAmount("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not start bank-to-bank transfer");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (shouldFundFromSourceBank(from, to) && from.currency === "USD") {
      const wallet = walletFor(to.currency);
      const totalUsd = parsed + fee;
      if (!wallet || Number(wallet.balance) < totalUsd) {
        toast.message("Top up the USD wallet from this Plaid bank, then withdraw to the destination.");
        setActive(from);
        setMode("topup");
        return;
      }
    }

    const wallet = walletFor(to.currency);
    if (!wallet) {
      toast.error(`Open a ${to.currency} wallet first, or top up from a linked bank.`);
      return;
    }
    if (Number(wallet.balance) < total) {
      toast.error(
        `Not enough ${to.currency} in your wallet (need ${fmt(total, to.currency)} including fees). Top up from a linked bank, or connect a Canadian bank with Plaid to pull from that account.`,
      );
      return;
    }

    setBusy(true);
    try {
      const transfer = await createTransfer.mutateAsync({
        sender_wallet_id: wallet.wallet_id,
        recipient_name: spec.recipientName,
        recipient_account: spec.recipientAccount,
        recipient_bank_code: spec.recipientBankCode || undefined,
        recipient_bank_name: spec.recipientBankName || undefined,
        recipient_country: spec.recipientCountry,
        transfer_type: "bank",
        payout_method: spec.payoutMethod,
        source_currency: to.currency,
        target_currency: to.currency,
        source_amount: parsed,
        target_amount: parsed,
        exchange_rate: 1,
        fee_amount: fee,
        funding_source: "wallet",
      });
      const { data, error } = await supabase.functions.invoke("execute-transfer", {
        body: { transfer_id: transfer.id, recipient_country_hint: spec.recipientCountry },
      });
      if (data?.success === false || data?.error) {
        throw new Error(String(data.error || data?.payout?.error || "Payout failed"));
      }
      if (error) throw error;
      toast.success("Transfer submitted");
      setMode("closed");
      setAmount("");
      navigate(`/transfers/${transfer.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  const runTopup = async (bank: LinkedBank) => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      const walletId = await ensureWalletId(bank.currency);

      if (canPlaidDebit(bank) && bank.currency === "CAD") {
        const { data, error } = await supabase.functions.invoke("intra-ca-transfer-create", {
          body: {
            plaid_account_id: bank.plaidAccountId,
            destination_wallet_id: walletId,
            amount_cad: parsed,
            description: `Top up CAD wallet from ${bank.institution}`,
            purpose: "topup",
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        showPayIn({
          heading: "Top up CAD from this bank",
          description: `Send CAD from ${bank.institution} ····${bank.lastFour} to Loop Bank. Your CAD wallet credits when the deposit matches this reference.`,
          fromBank: `${bank.institution} ····${bank.lastFour}`,
          reference: data.reference,
          fields: [
            { label: "Interac Autodeposit", value: data.loop_alias || LOOP_CAD_INTERAC_ALIAS },
            ...loopEftFields(data.loop_eft),
          ],
          note: data.message,
        });
        setAmount("");
        return;
      }

      if (bank.currency === "USD") {
        const { data, error } = await supabase.functions.invoke("wise-topup-intent", {
          body: { action: "create", amount: parsed, wallet_id: walletId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        const details = (data.account_details || []) as Array<{ label: string; value: string }>;
        showPayIn({
          heading: "Top up USD from this bank",
          description: `Send USD from ${bank.institution} ····${bank.lastFour} using these deposit details. Include the reference so we can credit your USD wallet.`,
          fromBank: `${bank.institution} ····${bank.lastFour}`,
          reference: data.intent?.reference,
          fields: details.length
            ? details
            : [{ label: "Instructions", value: (data.instructions || []).join(" ") || "Check Wise deposit details." }],
          note: "ACH from a Plaid-linked US bank typically settles in 1–2 business days.",
        });
        setAmount("");
        return;
      }

      if (bank.currency === "CAD") {
        showPayIn({
          heading: "Top up CAD from this bank",
          description: `Send CAD from ${bank.institution} ····${bank.lastFour} to Loop Bank. Your CAD wallet credits when the deposit is matched.`,
          fromBank: `${bank.institution} ····${bank.lastFour}`,
          fields: [
            { label: "Interac Autodeposit", value: LOOP_CAD_INTERAC_ALIAS },
            ...loopEftFields(LOOP_CAD_EFT),
          ],
          note: "Connect this bank with Plaid (Canada) to attach a unique payment reference automatically.",
        });
        setAmount("");
        return;
      }

      let va = vaFor(bank.currency);
      if (!va && (bank.currency === "NGN" || bank.currency === "GHS")) {
        await createVa.mutateAsync(bank.currency);
        const { data } = await supabase
          .from("virtual_accounts")
          .select("*")
          .eq("user_id", user!.id)
          .eq("currency_code", bank.currency)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        va = data as typeof va;
      }
      if (va) {
        showPayIn({
          heading: `Top up ${bank.currency} from this bank`,
          description: `Send ${fmt(parsed, bank.currency)} from ${bank.institution} ····${bank.lastFour} to your eFinMoney receive account. The matching wallet credits when the deposit arrives.`,
          fromBank: `${bank.institution} ····${bank.lastFour}`,
          fields: [
            { label: "Bank", value: va.bank_name },
            { label: "Account", value: va.account_number },
            { label: "Name", value: va.account_name },
          ],
        });
        setAmount("");
        return;
      }

      toast.message("Open Top up to finish this currency", {
        description: `${bank.currency} deposits use the Top up page when a receive account is not on file.`,
      });
      navigate(`/wallet/topup?currency=${bank.currency}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start wallet top-up");
    } finally {
      setBusy(false);
    }
  };

  const openMove = (bank: LinkedBank, next: "withdraw" | "pay" | "topup") => {
    if (next !== "topup") {
      const spec = payoutSpecFor(bank);
      if (next === "withdraw" && !spec.canPayout) {
        toast.error(spec.reason || "Payout isn't available for this bank yet.");
        return;
      }
    }
    if (!canMoveMoney) {
      toast.error(
        isBusiness
          ? "Finish business verification (KYB) to send from this account."
          : "Verify your identity to send to a bank.",
      );
      return;
    }
    setActive(bank);
    setPayTo(next === "pay" ? null : bank);
    setAmount("");
    setMode(next);
  };

  const sameCurrencyBanks = (bank: LinkedBank) =>
    linked.filter((b) => b.id !== bank.id && b.currency === bank.currency);

  return (
    <>
      <Card className="border-primary/30 bg-primary/[0.03]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Landmark className="h-4 w-4 text-primary" />
              {isBusiness ? "Company banks" : "Your banks"}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Link Canada and US banks with Plaid for live balances. Move money between this
              company’s accounts from the source bank when Plaid can debit it — otherwise withdraw
              from the eFinMoney wallet. Top up a wallet from any linked bank.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center shrink-0">
            {hasPlaid && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={refreshing}
                onClick={() => void refreshBalances(true)}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh balances
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setMode("plaidCountry")}
              disabled={linking}
            >
              {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
              Connect with Plaid
            </Button>
            <Button onClick={() => { resetAdd(); setMode("add"); }} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Link bank
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!canMoveMoney && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold">Verify to send</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can link a bank now. Sending or withdrawing uses our in-country payout rails and
                needs {isBusiness ? "an approved business (KYB) profile" : "an approved KYC profile"}.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to={isBusiness ? "/onboarding/business/details" : "/kyc"}>
                  Complete verification
                </Link>
              </Button>
            </div>
          )}

          {loadingSaved ? (
            <p className="text-sm text-muted-foreground">Loading linked banks…</p>
          ) : linked.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No banks linked yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the company’s operating account or your personal bank — Nigeria, Ghana, Kenya,
                Canada, and the US are supported. Connect with Plaid to link Canadian and US accounts,
                see live balances, top up a wallet, and send between company banks without pre-funding
                the wallet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {linked.map((bank) => {
                const spec = payoutSpecFor(bank);
                const wallet = walletFor(bank.currency);
                return (
                  <div
                    key={bank.id}
                    className="rounded-xl border border-border bg-card p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold truncate">{bank.institution}</p>
                          <Badge variant="outline">{bank.currency}</Badge>
                          {bank.source === "plaid" && <Badge variant="secondary">Plaid</Badge>}
                          {bank.needsReconnect && <Badge variant="destructive">Reconnect</Badge>}
                          {spec.canPayout ? (
                            <Badge>{spec.railLabel.split(" (")[0]}</Badge>
                          ) : (
                            <Badge variant="secondary">Link only</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {bank.accountName}
                          {bank.lastFour ? ` ····${bank.lastFour}` : ""}
                        </p>
                        {bank.source === "plaid" && (
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {formatLiveBankLine(
                              bank.liveAvailable,
                              bank.liveCurrent,
                              bank.liveCurrency || bank.currency,
                              bank.liveUpdatedAt,
                              fmt,
                            ) ||
                              (refreshing
                                ? "Bank balance · fetching…"
                                : bank.needsReconnect
                                  ? "Bank balance · reconnect with Plaid"
                                  : "Bank balance · unavailable")}
                          </p>
                        )}
                        {wallet && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            eFinMoney wallet · {fmt(Number(wallet.balance), bank.currency)}
                          </p>
                        )}
                      </div>
                      {bank.source === "saved" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove bank"
                          onClick={() => void removeBank(bank)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openMove(bank, "topup")}
                      >
                        <ArrowDownToLine className="mr-1.5 h-4 w-4" />
                        Top up wallet
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!spec.canPayout}
                        onClick={() => openMove(bank, "withdraw")}
                      >
                        <Wallet className="mr-1.5 h-4 w-4" />
                        Withdraw to this bank
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          sameCurrencyBanks(bank).filter((b) => payoutSpecFor(b).canPayout).length === 0
                        }
                        onClick={() => openMove(bank, "pay")}
                      >
                        <ArrowRightLeft className="mr-1.5 h-4 w-4" />
                        Send to another bank
                      </Button>
                    </div>
                    {!spec.canPayout && spec.reason && (
                      <p className="text-xs text-muted-foreground">{spec.reason}</p>
                    )}
                    {bank.needsReconnect && (
                      <p className="text-xs text-muted-foreground">
                        This bank login expired. Connect with Plaid again to restore live balances.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {linked.some((b) => b.source === "saved") && (
            <p className="text-xs text-muted-foreground">
              Plaid (Canada & US) can debit the source bank for same-company transfers and wallet
              top-ups. Manual Nigerian, Ghanaian, and Kenyan links top up by sending to your
              eFinMoney receive account; withdrawals still use the matching wallet.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={mode === "add"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link an existing bank</DialogTitle>
            <DialogDescription>
              {isBusiness
                ? "Add the company’s operating account. We’ll only ask for what that country’s rails need."
                : "Add a bank you already hold. We’ll only ask for what that country’s rails need."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Country</Label>
              <Select
                value={country}
                onValueChange={(v) => {
                  setCountry(v);
                  resetAdd();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINK_COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label} ({c.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {plaidOk && (
              <Button type="button" variant="outline" className="w-full" onClick={() => void startPlaid([country])} disabled={linking}>
                {linking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}
                Link with Plaid — live {country === "US" ? "USD" : "CAD"} balance
              </Button>
            )}

            {corridor ? (
              <>
                <div className="space-y-2">
                  <Label>Bank</Label>
                  <Select value={bankCode} onValueChange={setBankCode}>
                    <SelectTrigger>
                      <SelectValue placeholder={banks.length ? "Select bank" : "Loading banks…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.map((b) => (
                        <SelectItem key={b.code} value={b.code}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Account number</Label>
                  <Input
                    inputMode="numeric"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 20))}
                    placeholder={country === "NG" ? "10-digit NUBAN" : "Account number"}
                  />
                  {resolving && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Verifying account…
                    </p>
                  )}
                  {resolvedName && (
                    <p className="text-xs text-emerald-700 font-medium">Name on account: {resolvedName}</p>
                  )}
                </div>
              </>
            ) : (
              schema.fields.map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label>
                    {f.label}
                    {!f.required && <span className="text-muted-foreground"> (optional)</span>}
                  </Label>
                  <Input
                    value={manual[f.key] ?? ""}
                    inputMode={f.numeric ? "numeric" : "text"}
                    placeholder={f.placeholder}
                    onChange={(e) => {
                      let v = e.target.value;
                      if (f.numeric) v = v.replace(/\D/g, "");
                      if (f.uppercase) v = v.toUpperCase();
                      if (f.maxLength) v = v.slice(0, f.maxLength);
                      setManual((p) => ({ ...p, [f.key]: v }));
                    }}
                  />
                  {f.helper && <p className="text-xs text-muted-foreground">{f.helper}</p>}
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode("closed")}>
              Cancel
            </Button>
            <Button onClick={() => void saveBank()} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save bank
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "withdraw" || mode === "pay"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode === "withdraw" ? "Withdraw to your bank" : "Send to another linked bank"}</DialogTitle>
            <DialogDescription>
              {mode === "pay" && active && payTo && shouldFundFromSourceBank(active, payTo) && payTo.currency === "CAD"
                ? `We’ll debit ${active.institution} via Plaid/Loop and pay ${payTo.institution} when the deposit matches. You don’t need a pre-funded wallet.`
                : mode === "pay"
                  ? "Same-currency move between this company’s linked banks. Plaid Canada/US sources pull from the bank; otherwise we use the eFinMoney wallet."
                  : `Same-currency payout from your eFinMoney wallet via ${active ? payoutSpecFor(active).railLabel : "our rails"}.`}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              {mode === "pay" && (
                <div className="space-y-2">
                  <Label>Destination bank</Label>
                  <Select
                    value={payTo?.id || ""}
                    onValueChange={(id) =>
                      setPayTo(
                        sameCurrencyBanks(active).filter((b) => payoutSpecFor(b).canPayout).find((b) => b.id === id) ||
                          null,
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a linked bank" />
                    </SelectTrigger>
                    <SelectContent>
                      {sameCurrencyBanks(active)
                        .filter((b) => payoutSpecFor(b).canPayout)
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.institution} ····{b.lastFour}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode === "pay" && payTo && shouldFundFromSourceBank(active, payTo) && payTo.currency === "CAD" ? (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                  <p className="text-sm font-medium">Funded from {active.institution} ····{active.lastFour}</p>
                  {preferredLiveBalance(active.liveAvailable, active.liveCurrent) != null && (
                    <p className="text-sm">
                      Bank available:{" "}
                      {fmt(
                        preferredLiveBalance(active.liveAvailable, active.liveCurrent)!,
                        (active.liveCurrency || active.currency).toUpperCase(),
                      )}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Settlement still lands in your CAD wallet for a moment so we can pay the destination bank. You do not top up first.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm">
                    From eFinMoney wallet:{" "}
                    <span className="font-medium">
                      {walletFor(active.currency)
                        ? fmt(Number(walletFor(active.currency)!.balance), active.currency)
                        : `No ${active.currency} wallet`}
                    </span>
                  </p>
                  {active.source === "plaid" && (
                    <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                      <p className="text-sm">
                        Bank available:{" "}
                        <span className="font-medium">
                          {preferredLiveBalance(active.liveAvailable, active.liveCurrent) != null
                            ? fmt(
                                preferredLiveBalance(active.liveAvailable, active.liveCurrent)!,
                                (active.liveCurrency || active.currency).toUpperCase(),
                              )
                            : "Not available yet"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mode === "withdraw"
                          ? "This withdrawal debits the eFinMoney wallet, not the bank ledger."
                          : "Connect Plaid on a Canadian source bank to pull from that account instead of the wallet."}
                      </p>
                    </div>
                  )}
                </>
              )}
              <p className="text-sm">
                To:{" "}
                <span className="font-medium">
                  {(mode === "pay" ? payTo : active)?.institution} ····{(mode === "pay" ? payTo : active)?.lastFour}
                </span>
              </p>
              {mode === "pay" && (
                <Button
                  type="button"
                  variant="link"
                  className="px-0 h-auto"
                  onClick={() => {
                    resetAdd();
                    setMode("add");
                  }}
                >
                  Link another bank instead
                </Button>
              )}
              <div className="space-y-2">
                <Label>Amount ({active.currency})</Label>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
                {retailPayoutFeeNative(active.currency) && (
                  <p className="text-xs text-muted-foreground">
                    Payout fee {fmt(retailPayoutFeeNative(active.currency)!.amount, active.currency)}
                  </p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode("closed")}>
              Cancel
            </Button>
            <Button
              disabled={busy || !active || (mode === "pay" && !payTo)}
              onClick={() => {
                const dest = mode === "pay" ? payTo : active;
                if (!active || !dest) return;
                const parsed = Number(amount);
                requirePin(
                  () => runPayout(active, dest),
                  Number.isFinite(parsed) ? fmt(parsed, dest.currency) : undefined,
                  `Pay ${dest.institution}`,
                );
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "topup"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up wallet from this bank</DialogTitle>
            <DialogDescription>
              {active?.source === "plaid" && active.currency === "CAD"
                ? "We’ll give you Loop Bank details so this Plaid-linked Canadian account can fund your CAD wallet."
                : active?.currency === "USD"
                  ? "Send USD from this linked bank using the deposit details we generate for your USD wallet."
                  : "Send from this linked bank to your eFinMoney receive account for this currency."}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <p className="text-sm">
                From: <span className="font-medium">{active.institution} ····{active.lastFour}</span>
              </p>
              {active.source === "plaid" && preferredLiveBalance(active.liveAvailable, active.liveCurrent) != null && (
                <p className="text-sm text-muted-foreground">
                  Bank available{" "}
                  {fmt(
                    preferredLiveBalance(active.liveAvailable, active.liveCurrent)!,
                    (active.liveCurrency || active.currency).toUpperCase(),
                  )}
                </p>
              )}
              <p className="text-sm">
                To:{" "}
                <span className="font-medium">
                  {walletFor(active.currency)
                    ? `eFinMoney ${active.currency} wallet · ${fmt(Number(walletFor(active.currency)!.balance), active.currency)}`
                    : `New ${active.currency} wallet (we’ll open one)`}
                </span>
              </p>
              <div className="space-y-2">
                <Label>Amount ({active.currency})</Label>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMode("closed")}>
              Cancel
            </Button>
            <Button
              disabled={busy || !active}
              onClick={() => {
                if (!active) return;
                const parsed = Number(amount);
                requirePin(
                  () => runTopup(active),
                  Number.isFinite(parsed) ? fmt(parsed, active.currency) : undefined,
                  `Top up from ${active.institution}`,
                );
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "plaidCountry"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect a Canada or US bank</DialogTitle>
            <DialogDescription>
              Plaid Instant Auth links the login, pulls a live balance, and lets you top up or send
              between this company’s accounts without pre-funding the wallet (Canada).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              disabled={linking}
              onClick={() => {
                setMode("closed");
                void startPlaid(["CA"]);
              }}
            >
              <Building2 className="mr-2 h-4 w-4" />
              Canada — CAD checking / savings
            </Button>
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              disabled={linking}
              onClick={() => {
                setMode("closed");
                void startPlaid(["US"]);
              }}
            >
              <Building2 className="mr-2 h-4 w-4" />
              United States — USD ACH
            </Button>
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              disabled={linking}
              onClick={() => {
                setMode("closed");
                void startPlaid(["CA", "US"]);
              }}
            >
              <Building2 className="mr-2 h-4 w-4" />
              Both Canada and the US
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "instructions"} onOpenChange={(o) => !o && setMode("closed")}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send from the linked bank</DialogTitle>
            <DialogDescription>
              Complete the transfer in your banking app using these details.
            </DialogDescription>
          </DialogHeader>
          {payIn && <BankPayInInstructions data={payIn} />}
          <DialogFooter>
            <Button onClick={() => setMode("closed")}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {pinGate}
    </>
  );
}
