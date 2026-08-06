import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExternalLink, FileText, Loader2, Smartphone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  clearPendingPaytotaTxn,
  confirmPaytotaPayment,
  getPaytotaPayStatus,
  initiatePaytotaCollection,
  isPaytotaAfricaTopupCurrency,
  isPaytotaTopupCurrency,
  paytotaMinAmount,
  readPendingPaytotaTxn,
  savePendingPaytotaTxn,
} from "@/lib/paytotaPay";
import { quoteDirectNombaTopup } from "@/lib/nombaTopupQuote";
import { currencySymbol } from "@/lib/currency";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

function formatCredited(amount: number, currency: string): string {
  const c = currency.toUpperCase();
  const zeroDec = c === "UGX" || c === "RWF";
  const digits = zeroDec ? 0 : 2;
  const sym = currencySymbol(c) || (c === "GBP" ? "£" : c === "EUR" ? "€" : c === "CAD" ? "C$" : "$");
  return `${sym}${amount.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${c}`;
}

function phonePlaceholder(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "KES") return "2547…";
  if (c === "RWF") return "2507…";
  return "2567…";
}

function expectedDial(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "KES") return "254";
  if (c === "RWF") return "250";
  return "256";
}

function phoneLooksValidForCurrency(phone: string, currency: string): boolean {
  const dial = expectedDial(currency);
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith(dial)) return digits.length >= dial.length + 8;
  // Allow national numbers starting with 0 / 7
  if (digits.startsWith("0") && digits.length >= 9) return true;
  if (digits.startsWith("7") && digits.length >= 9) return true;
  return false;
}

export default function PaytotaTopUpCard({ walletId, walletCurrency, onComplete, initialAmount }: Props) {
  const { user } = useAuth();
  const currency = walletCurrency.toUpperCase();
  const africa = isPaytotaAfricaTopupCurrency(currency);
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [awaitingPhone, setAwaitingPhone] = useState(false);
  const [checkoutLink, setCheckoutLink] = useState<string | null>(null);

  useEffect(() => {
    if (!email && user?.email) setEmail(user.email);
  }, [user?.email, email]);

  useEffect(() => {
    const pendingId = readPendingPaytotaTxn();
    if (!pendingId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 40) return;
      attempts += 1;

      try {
        await confirmPaytotaPayment({ transaction_id: pendingId });
      } catch {
        /* status table poll still runs */
      }

      const status = await getPaytotaPayStatus(pendingId);
      if (!status || status.status === "pending" || status.status === "processing") {
        setTimeout(poll, 3000);
        return;
      }
      if (status.status === "completed") {
        clearPendingPaytotaTxn();
        setAwaitingPhone(false);
        setCheckoutLink(null);
        const credited = status.credit_amount ?? status.amount;
        const creditedCcy = status.credit_currency ?? status.currency;
        toast.success(`Wallet credited ${formatCredited(credited, creditedCcy)}`);
        onComplete?.();
        return;
      }
      if (status.status === "failed") {
        clearPendingPaytotaTxn();
        setAwaitingPhone(false);
        setCheckoutLink(null);
        toast.error(status.failure_reason || "Top-up failed");
      }
    };

    void poll();
    return () => { cancelled = true; };
  }, [onComplete]);

  const parsedAmount = Number(amount);
  const quote = useMemo(() => {
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return null;
    return quoteDirectNombaTopup(parsedAmount, currency);
  }, [parsedAmount, currency]);

  if (!isPaytotaTopupCurrency(currency)) return null;

  const min = paytotaMinAmount(currency);
  const TitleIcon = africa ? Smartphone : FileText;
  const title = "Secure checkout";

  const handleConfirm = async () => {
    const amt = parsedAmount;
    if (!Number.isFinite(amt) || amt < min) {
      toast.error(`Enter at least ${formatCredited(min, currency)}`);
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (africa && !phone.trim()) {
      toast.error("Enter the mobile money phone number");
      return;
    }
    if (africa && !phoneLooksValidForCurrency(phone, currency)) {
      toast.error(`Use a ${currency} number (starts with ${expectedDial(currency)})`);
      return;
    }

    setLoading(true);
    try {
      const result = await initiatePaytotaCollection({
        credit_amount: amt,
        amount: amt,
        target_wallet_id: walletId,
        email: email.trim(),
        phone: africa ? phone.trim() : undefined,
        return_url: `${window.location.origin}/wallet/topup?walletId=${walletId}`,
      });
      savePendingPaytotaTxn(result.transaction_id);

      // STK path: stay on page — never auto-open /invoice/ (that is not MoMo pay).
      if (result.stk_push) {
        const link = result.payment_link && !/\/invoice\/?$/i.test(result.payment_link)
          ? result.payment_link
          : null;
        setCheckoutLink(link);
        setAwaitingPhone(true);
        toast.success("Approve the payment on your phone", {
          description: link
            ? "No prompt? You can open the secure checkout as a backup."
            : "Check MTN/Airtel for a PIN / STK prompt.",
          duration: 12000,
        });
        setLoading(false);
        return;
      }

      // Invoice/redirect path (Western only — Africa returns stk_push or error).
      if (!result.payment_link) {
        throw new Error("No checkout link returned");
      }
      if (/\/invoice\/?$/i.test(result.payment_link) && africa) {
        throw new Error(
          "Paytota returned an invoice page instead of MoMo. Collection terminals may not be enabled — contact Paytota.",
        );
      }
      toast.message(africa ? "Opening mobile money checkout" : "Opening invoice", {
        description: `Confirm ${formatCredited(quote?.checkoutAmount ?? amt, currency)}.`,
      });
      window.location.href = result.payment_link;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setLoading(false);
    }
  };

  return (
    <Card className="border-sky-500/30 bg-gradient-to-br from-sky-950/15 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TitleIcon className="h-4 w-4 text-sky-500" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {africa
            ? `Confirm the amount to open a secure mobile money checkout. Your ${currency} wallet credits when payment succeeds.`
            : `Confirm the amount to open a secure payment invoice. Your ${currency} wallet credits when the invoice is paid.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!initialAmount && (
          <div className="space-y-2">
            <Label>Amount to credit ({currency})</Label>
            <Input
              type="number"
              min={min}
              step={currency === "UGX" || currency === "RWF" ? "1" : "0.01"}
              placeholder="e.g. 25"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Minimum {formatCredited(min, currency)} · Includes processing fee (1.9% + fixed)
            </p>
          </div>
        )}

        {quote && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Wallet credit</span>
              <span className="font-medium tabular-nums">{formatCredited(quote.creditAmount, quote.creditCurrency)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Processing fee</span>
              <span className="font-medium tabular-nums">{formatCredited(quote.feeAmount, quote.creditCurrency)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{africa ? "Checkout total" : "Invoice total"}</span>
              <span className="font-semibold tabular-nums">{formatCredited(quote.checkoutAmount, quote.checkoutCurrency)}</span>
            </div>
          </div>
        )}

        {africa && (
          <div className="space-y-2">
            <Label>Mobile money phone</Label>
            <Input
              type="tel"
              placeholder={phonePlaceholder(currency)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>{africa ? "Email" : "Email for invoice"}</Label>
          <Input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {awaitingPhone && (
          <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-3 space-y-3">
            <p className="text-sm font-medium">Waiting for phone approval…</p>
            <p className="text-xs text-muted-foreground">
              Check the MoMo phone for a PIN / STK prompt. If nothing arrives, open the secure checkout page and pay there instead.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {checkoutLink && (
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => {
                    const opened = window.open(checkoutLink, "_blank", "noopener,noreferrer");
                    if (!opened) toast.error("Pop-up blocked. Allow pop-ups and tap this button again to open checkout.");
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open checkout page
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setAwaitingPhone(false);
                  setCheckoutLink(null);
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        )}

        <Button className="w-full" onClick={handleConfirm} disabled={loading || !quote || awaitingPhone || !(Number(amount) > 0)}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {africa ? "Opening checkout…" : "Creating invoice…"}
            </>
          ) : (
            <>
              <TitleIcon className="h-4 w-4 mr-2" />
              {quote
                ? `Confirm — ${formatCredited(quote.checkoutAmount, quote.checkoutCurrency)}`
                : "Confirm"}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
