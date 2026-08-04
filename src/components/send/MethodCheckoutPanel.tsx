import { AlertCircle, CreditCard, Landmark, Lock, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface PanelWallet {
  wallet_id: string;
  currency_code: string;
  symbol: string;
  balance: number | string;
  flag_emoji?: string | null;
}

export interface PanelBankSource {
  id: string;
  display_name: string;
  institution?: string | null;
  last_four?: string | null;
}

interface Props {
  method: "card" | "bank" | "wallet";
  /** Wallets valid for the active method. */
  wallets: PanelWallet[];
  selectedWalletId?: string;
  onWalletChange: (id: string) => void;
  linkedCardCount?: Record<string, number>;

  bankSources: PanelBankSource[];
  selectedSourceId?: string;
  onSourceChange: (id: string) => void;
  onLinkBank: () => void;
  linkingBank?: boolean;

  /** Money summary — fee is charged on top of the send amount. */
  amount: number;
  fee: number;
  total: number;
  currency: string;
  symbol: string;

  /** Card rail info */
  cardProviderReady?: boolean;
  cardChargeNote?: string | null;
  cardMinNote?: string | null;
  insufficientBalance?: boolean;
  onTopUp?: () => void;
}

const money = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ChargeSummary = ({
  amount, fee, total, currency, symbol, debitLabel,
}: { amount: number; fee: number; total: number; currency: string; symbol: string; debitLabel: string }) => {
  if (amount <= 0) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5 space-y-1 text-xs">
      <div className="flex justify-between"><span className="text-muted-foreground">Transfer amount</span><span className="tabular-nums">{symbol}{money(amount)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">Fee</span><span className="tabular-nums">+{symbol}{money(fee)}</span></div>
      <div className="flex justify-between border-t border-border/70 pt-1 font-semibold">
        <span>{debitLabel}</span><span className="tabular-nums">{symbol}{money(total)} {currency}</span>
      </div>
    </div>
  );
};

/** Renders the checkout procedure that belongs to the selected payment method. */
const MethodCheckoutPanel = ({
  method,
  wallets,
  selectedWalletId,
  onWalletChange,
  linkedCardCount = {},
  bankSources,
  selectedSourceId,
  onSourceChange,
  onLinkBank,
  linkingBank,
  amount,
  fee,
  total,
  currency,
  symbol,
  cardProviderReady,
  cardChargeNote,
  cardMinNote,
  insufficientBalance,
  onTopUp,
}: Props) => {
  const walletSelect = (label: string, helper?: string) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={selectedWalletId || wallets[0]?.wallet_id} onValueChange={onWalletChange}>
        <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
        <SelectContent>
          {wallets.map((w) => {
            const cards = linkedCardCount[w.wallet_id] ?? 0;
            return (
              <SelectItem key={w.wallet_id} value={w.wallet_id}>
                <span className="flex items-center gap-2">
                  {w.flag_emoji} {w.currency_code} — {w.symbol}{money(Number(w.balance))}
                  {cards > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground ml-auto">
                      <CreditCard className="w-3 h-3" />{cards}
                    </span>
                  )}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );

  if (method === "card") {
    return (
      <div className="space-y-3 rounded-xl border-2 border-pay-card/30 bg-pay-card/5 p-3.5">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-pay-card" />
          <p className="text-sm font-semibold">Card checkout</p>
        </div>

        {wallets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Create a supported wallet to pay by card.
          </div>
        ) : (
          <>
            {walletSelect("Charge in", "Your card is billed in this currency, then the transfer is funded from it.")}
            <ChargeSummary
              amount={amount} fee={fee} total={total} currency={currency} symbol={symbol}
              debitLabel="Charged to your card"
            />
            {cardChargeNote && <p className="text-[11px] text-muted-foreground">{cardChargeNote}</p>}
            <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1.5">
              <p className="text-xs font-medium">Card details</p>
              <p className="text-[11px] text-muted-foreground">
                Cardholder name, card number, expiry date and CVV are entered at the final step on our
                PCI-secure checkout. We never store your full card number.
              </p>
              <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Lock className="w-3 h-3" /> Visa · Mastercard · Amex · Verve
              </p>
            </div>
            {!cardProviderReady && amount > 0 && (
              <p className="flex items-start gap-1.5 text-[11px] text-destructive">
                <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
                No card rail is available for this corridor yet — try another currency or payment method.
              </p>
            )}
            {cardMinNote && <p className="text-[11px] text-muted-foreground">{cardMinNote}</p>}
          </>
        )}
      </div>
    );
  }

  if (method === "bank") {
    return (
      <div className="space-y-3 rounded-xl border-2 border-pay-bank/30 bg-pay-bank/5 p-3.5">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-pay-bank" />
          <p className="text-sm font-semibold">Bank debit (ACH / EFT)</p>
        </div>
        {bankSources.length > 0 ? (
          <>
            <div className="space-y-2">
              <Label>From bank account</Label>
              <Select value={selectedSourceId || bankSources[0]?.id} onValueChange={onSourceChange}>
                <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                <SelectContent>
                  {bankSources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      🏦 {s.institution ? `${s.institution} ` : ""}{s.display_name} ••••{s.last_four}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ChargeSummary
              amount={amount} fee={fee} total={total} currency={currency} symbol={symbol}
              debitLabel="Debited from your bank"
            />
            <p className="text-[11px] text-muted-foreground">Bank debits settle in 1–2 business days.</p>
          </>
        ) : (
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">
                No bank accounts linked. Connect your bank to fund transfers via ACH/EFT.
              </p>
            </div>
            <Button type="button" size="sm" className="w-full" onClick={onLinkBank} disabled={linkingBank}>
              <Landmark className="w-4 h-4 mr-2" />
              {linkingBank ? "Starting…" : "Link bank account"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border-2 border-pay-wallet/30 bg-pay-wallet/5 p-3.5">
      <div className="flex items-center gap-2">
        <WalletIcon className="w-4 h-4 text-pay-wallet" />
        <p className="text-sm font-semibold">Pay from wallet balance</p>
      </div>
      {wallets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          You have no wallets yet.
        </div>
      ) : (
        <>
          {walletSelect("From wallet")}
          <ChargeSummary
            amount={amount} fee={fee} total={total} currency={currency} symbol={symbol}
            debitLabel="Debited from wallet"
          />
          {insufficientBalance && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
              <p className="text-[11px] font-medium text-destructive">Balance too low for amount + fee</p>
              {onTopUp && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={onTopUp}>
                  Top up
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MethodCheckoutPanel;
