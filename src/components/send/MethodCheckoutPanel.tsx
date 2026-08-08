import { AlertCircle, CreditCard, Landmark, Lock, Plus, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CurrencyFlag } from "@/components/ui/FlagImage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CardFieldsInputs, type CardFieldsValue } from "@/components/payments/cardFields";

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

export interface PanelSavedCard {
  id: string;
  card_brand?: string | null;
  last_four?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
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

  /** Saved cards + quick-add hooks */
  savedCards?: PanelSavedCard[];
  selectedCardId?: string;
  onCardChange?: (id: string) => void;
  onAddCard?: () => void;
  onAddWallet?: () => void;

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
  inlineEntry?: boolean;
  /** Inline card capture (single-capture flows). */
  cardFields?: CardFieldsValue;
  onCardFieldsChange?: (next: CardFieldsValue) => void;
  insufficientBalance?: boolean;
  onTopUp?: () => void;
}

type QuickTone = "card" | "bank" | "wallet";

const quickToneClass: Record<QuickTone, string> = {
  card: "border-pay-card/40 text-pay-card hover:bg-pay-card/10",
  bank: "border-pay-bank/40 text-pay-bank hover:bg-pay-bank/10",
  wallet: "border-pay-wallet/40 text-pay-wallet hover:bg-pay-wallet/10",
};

const QuickAddRow = ({
  tone, label, onClick, disabled,
}: { tone: QuickTone; label: string; onClick: () => void; disabled?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none",
      quickToneClass[tone],
    )}
  >
    <Plus className="h-3.5 w-3.5" />
    {label}
  </button>
);


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
  savedCards = [],
  selectedCardId,
  onCardChange,
  onAddCard,
  onAddWallet,
  amount,
  fee,
  total,
  currency,
  symbol,
  cardProviderReady,
  cardChargeNote,
  cardMinNote,
  inlineEntry,
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
                  <CurrencyFlag code={w.currency_code} /> {w.currency_code} — {w.symbol}{money(Number(w.balance))}
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
          <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
            <p className="text-sm text-muted-foreground">Create a supported wallet to pay by card.</p>
            {onAddWallet && <QuickAddRow tone="wallet" label="Quick add wallet" onClick={onAddWallet} />}
          </div>
        ) : (
          <>
            <ChargeSummary
              amount={amount} fee={fee} total={total} currency={currency} symbol={symbol}
              debitLabel="Charged to your card"
            />
            {cardChargeNote && <p className="text-[11px] text-muted-foreground">{cardChargeNote}</p>}
            <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
              <p className="text-xs font-medium">Card details</p>

              {savedCards.length > 0 && (
                <div className="space-y-1.5">
                  {savedCards.map((c) => {
                    const selected = c.id === selectedCardId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onCardChange?.(c.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                          selected ? "border-pay-card bg-pay-card/10" : "border-border hover:bg-muted/50",
                        )}
                      >
                        <span className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                          selected ? "border-pay-card" : "border-muted-foreground/40",
                        )}>
                          {selected && <span className="h-2 w-2 rounded-full bg-pay-card" />}
                        </span>
                        <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs font-medium capitalize">
                          {c.card_brand || "Card"} •••• {c.last_four || "----"}
                        </span>
                        {c.exp_month && c.exp_year && (
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                            {String(c.exp_month).padStart(2, "0")}/{String(c.exp_year).slice(-2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {onAddCard && (
                <QuickAddRow
                  tone="card"
                  label={savedCards.length > 0 ? "Quick add new card" : "Quick add card details"}
                  onClick={onAddCard}
                />
              )}

              {inlineEntry && cardFields && onCardFieldsChange && (
                <div className="pt-1">
                  <CardFieldsInputs value={cardFields} onChange={onCardFieldsChange} />
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                {inlineEntry
                  ? "We never store your full card number. Your bank may ask for an extra security check at the confirm step."
                  : "Cardholder name, card number, expiry date and CVV are entered at the final step on our PCI-secure checkout page."}
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
            <QuickAddRow
              tone="bank"
              label={linkingBank ? "Starting…" : "Quick add bank account"}
              onClick={onLinkBank}
              disabled={linkingBank}
            />
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
        <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">You have no wallets yet.</p>
          {onAddWallet && <QuickAddRow tone="wallet" label="Quick add wallet" onClick={onAddWallet} />}
        </div>
      ) : (
        <>
          {walletSelect("From wallet")}
          {onAddWallet && <QuickAddRow tone="wallet" label="Quick add wallet" onClick={onAddWallet} />}
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
