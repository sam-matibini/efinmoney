import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCreateWallet } from "@/hooks/useCreateWallet";
import { useWallets } from "@/hooks/useWallets";
import { useVirtualAccounts, useCreateVirtualAccount } from "@/hooks/useVirtualAccounts";
import { productFeatures } from "@/lib/productFeatures";
import {
  bankCheckoutReference,
  buildBankCheckoutRedirectUrl,
  supportsFincraBankCheckout,
  type BankCheckoutPurpose,
} from "@/lib/bankCheckout";
import BankPayInInstructions, { type PayInInstructions } from "@/components/payments/BankPayInInstructions";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";

const fmt = (n: number, ccy: string) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ccy}`;

export default function BankAccountCheckout({
  purpose,
  currency,
  walletId,
  amount: amountProp = 0,
  transferId,
  destLabel,
  fromBankLabel,
  onComplete,
}: {
  purpose: BankCheckoutPurpose;
  currency: string;
  walletId?: string;
  amount?: number;
  transferId?: string;
  destLabel: string;
  fromBankLabel?: string;
  onComplete?: () => void;
}) {
  const { user } = useAuth();
  const { data: wallets = [] } = useWallets();
  const createWallet = useCreateWallet();
  const { data: vas = [] } = useVirtualAccounts();
  const createVa = useCreateVirtualAccount();
  const ccy = currency.toUpperCase();
  const [amt, setAmt] = useState(amountProp > 0 ? String(amountProp) : "");
  const [busy, setBusy] = useState(false);
  const [payIn, setPayIn] = useState<PayInInstructions | null>(null);

  useEffect(() => {
    if (amountProp > 0) setAmt(String(amountProp));
  }, [amountProp]);

  const parsed = Number(amt);
  const validAmt = Number.isFinite(parsed) && parsed > 0;
  const fincraBank = productFeatures.fincra && supportsFincraBankCheckout(ccy);
  const vaOk = (ccy === "NGN" || ccy === "GHS") && productFeatures.flutterwave;
  const wallet =
    wallets.find((w) => w.wallet_id === walletId) ||
    wallets.find((w) => String(w.currency_code).toUpperCase() === ccy);

  const ensureWalletId = async (): Promise<string> => {
    if (walletId) return walletId;
    if (wallet?.wallet_id) return wallet.wallet_id;
    const created = await createWallet.mutateAsync(ccy);
    return created.id;
  };

  const heading =
    purpose === "send"
      ? "Pay from your bank, then we pay the recipient"
      : purpose === "bank_move"
        ? "Bank-to-bank checkout"
        : "Top up by bank transfer";

  const description =
    purpose === "send"
      ? `Send ${ccy} from your bank to the checkout account. When the deposit matches, we pay ${destLabel}. You do not need a pre-funded wallet.`
      : purpose === "bank_move"
        ? `Pay the exact amount from your bank. We credit the matching wallet, then complete the move to ${destLabel}.`
        : `Pay ${ccy} from your bank app to a checkout account. The matching eFinMoney wallet credits when the transfer lands.`;

  const openFincraBankCheckout = async () => {
    if (!validAmt) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      const wid = await ensureWalletId();
      const { url: redirectUrl, usesProductionReturn } = buildBankCheckoutRedirectUrl(purpose);
      if (usesProductionReturn) {
        toast.info("After payment, you will return to efin.money (required for checkout).");
      }
      const reference = bankCheckoutReference(purpose, user?.id || "", wid);
      const { data, error } = await supabase.functions.invoke("fincra-initialize-checkout", {
        body: {
          amount: parsed,
          currency: ccy,
          charge_amount: parsed,
          charge_currency: ccy,
          credit_amount: parsed,
          credit_currency: ccy,
          redirectUrl,
          reference,
          walletId: wid,
          paymentMethods: ["bank_transfer"],
          purpose,
          transfer_id: transferId || undefined,
          type: purpose === "send" ? "bank_send" : purpose === "bank_move" ? "bank_move" : "wallet_topup",
        },
      });
      if (error) throw error;
      const payload = data as { payment_link?: string; error?: string };
      if (payload.error || !payload.payment_link) {
        throw new Error(payload.error || "Checkout link was empty");
      }
      toast.message("Opening bank transfer checkout");
      window.location.href = payload.payment_link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start bank checkout");
    } finally {
      setBusy(false);
    }
  };

  const showReceiveAccount = async () => {
    if (!validAmt) {
      toast.error("Enter an amount.");
      return;
    }
    setBusy(true);
    try {
      await ensureWalletId();
      let va = vas.find(
        (a) => a.status === "active" && String(a.currency_code).toUpperCase() === ccy,
      );
      if (!va) {
        await createVa.mutateAsync(ccy);
        const { data } = await supabase
          .from("virtual_accounts")
          .select("*")
          .eq("user_id", user!.id)
          .eq("currency_code", ccy)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        va = data as typeof va;
      }
      if (!va) throw new Error("Could not issue a receive account.");
      setPayIn({
        heading: `Send ${fmt(parsed, ccy)} from your bank`,
        description: `Transfer from ${fromBankLabel || "your bank"} to this eFinMoney account. ${destLabel} credits when the deposit arrives.`,
        fromBank: fromBankLabel || "Your bank app",
        fields: [
          { label: "Bank", value: va.bank_name },
          { label: "Account", value: va.account_number },
          { label: "Name", value: va.account_name },
        ],
        note: "Use the exact amount so we can match the deposit.",
      });
      onComplete?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load receive account");
    } finally {
      setBusy(false);
    }
  };

  if (ccy === "CAD") {
    return (
      <div className="space-y-3 rounded-xl border-2 border-pay-bank/30 bg-pay-bank/5 p-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-pay-bank" />
          <p className="text-sm font-semibold">Canadian bank checkout</p>
        </div>
        <p className="text-sm text-muted-foreground">
          CAD bank pay-in uses Interac Autodeposit ({FINCRA_CAD_INTERAC_ALIAS}) or a linked Plaid
          account on the Bank tab. That path already funds {destLabel}.
        </p>
        <Button asChild className="w-full">
          <Link to={purpose === "send" ? "/send" : "/wallet/topup?currency=CAD&method=interac"}>
            Open Interac checkout
          </Link>
        </Button>
      </div>
    );
  }

  if (!fincraBank && !vaOk) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Bank transfer checkout is not live for {ccy} yet. Use card checkout or a linked bank on the
        Bank tab.
      </div>
    );
  }

  if (payIn) {
    return (
      <div className="space-y-3">
        <BankPayInInstructions data={payIn} />
        <Button type="button" variant="outline" className="w-full" onClick={() => setPayIn(null)}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-pay-bank/30 bg-pay-bank/5 p-4">
      <div className="flex items-center gap-2">
        <Landmark className="h-4 w-4 text-pay-bank" />
        <p className="text-sm font-semibold">{heading}</p>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {fromBankLabel && (
        <p className="text-sm">
          Suggested source: <span className="font-medium">{fromBankLabel}</span>
        </p>
      )}
      <p className="text-sm">
        To: <span className="font-medium">{destLabel}</span>
      </p>
      {!(amountProp > 0) && (
        <div className="space-y-2">
          <Label>Amount ({ccy})</Label>
          <Input
            inputMode="decimal"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            placeholder="0.00"
          />
        </div>
      )}
      {amountProp > 0 && (
        <p className="text-sm font-medium tabular-nums">Amount {fmt(parsed, ccy)}</p>
      )}
      {fincraBank && (
        <Button className="w-full" size="lg" disabled={busy || !validAmt} onClick={() => void openFincraBankCheckout()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Landmark className="mr-2 h-4 w-4" />}
          Open bank transfer checkout
        </Button>
      )}
      {vaOk && (
        <Button
          type="button"
          variant={fincraBank ? "outline" : "default"}
          className="w-full"
          disabled={busy || !validAmt}
          onClick={() => void showReceiveAccount()}
        >
          Pay my eFinMoney {ccy} account
        </Button>
      )}
      <p className="text-[11px] text-muted-foreground">
        Checkout shows a one-time bank account for this amount. Paying your permanent receive
        account also works — include the exact amount.
      </p>
    </div>
  );
}
