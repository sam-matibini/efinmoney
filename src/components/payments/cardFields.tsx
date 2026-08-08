import { CreditCard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cardBrandClass } from "@/lib/cardBrand";

export interface CardFieldsValue {
  cardholderName: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  billingLine1: string;
  billingCity: string;
  billingZip: string;
}

export const emptyCardFields: CardFieldsValue = {
  cardholderName: "",
  cardNumber: "",
  expiry: "",
  cvc: "",
  billingLine1: "",
  billingCity: "",
  billingZip: "",
};

export function detectCardBrand(number: string): string | null {
  const cleaned = number.replace(/\s/g, "");
  if (/^4/.test(cleaned)) return "visa";
  if (/^5[1-5]/.test(cleaned)) return "mastercard";
  if (/^3[47]/.test(cleaned)) return "amex";
  if (/^6(?:011|5)/.test(cleaned)) return "discover";
  if (/^506[0-1]|^650[0-3]/.test(cleaned)) return "verve";
  return null;
}

export function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})(?=.)/g, "$1 ");
}

export function parseExpiry(expiry: string): { month: string; year: string } {
  const raw = expiry.replace(/\D/g, "").slice(0, 4);
  if (raw.length >= 3) return { month: raw.slice(0, 2), year: raw.slice(2) };
  if (raw.length === 2) {
    const m = parseInt(raw, 10);
    if (m > 12) return { month: raw.slice(0, 1), year: raw.slice(1) };
    return { month: raw, year: "" };
  }
  return { month: raw, year: "" };
}

export function formatExpiryDisplay(val: string): string {
  const d = val.replace(/\D/g, "").slice(0, 4);
  if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

export function isCardFieldsValid(v: CardFieldsValue): boolean {
  const { month, year } = parseExpiry(v.expiry);
  return (
    v.cardholderName.trim().length > 1 &&
    v.cardNumber.replace(/\s/g, "").length >= 13 &&
    month.length === 2 &&
    year.length === 2 &&
    v.cvc.length >= 3
  );
}

/** "Visa •••• 3701 · exp 02/31" — safe to render in a summary. */
export function maskedCardLabel(v: CardFieldsValue): string {
  const digits = v.cardNumber.replace(/\s/g, "");
  const brand = detectCardBrand(digits);
  const brandLabel = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Card";
  const last4 = digits.slice(-4) || "----";
  const exp = formatExpiryDisplay(v.expiry);
  return `${brandLabel} •••• ${last4}${exp ? ` · exp ${exp}` : ""}`;
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-3.5 transition-colors">
        {children}
      </div>
    </div>
  );
}

interface CardFieldsInputsProps {
  value: CardFieldsValue;
  onChange: (next: CardFieldsValue) => void;
  disabled?: boolean;
}

/** Single card capture: cardholder, number, expiry, CVC and optional billing. */
export function CardFieldsInputs({ value, onChange, disabled }: CardFieldsInputsProps) {
  const set = (patch: Partial<CardFieldsValue>) => onChange({ ...value, ...patch });
  const brand = detectCardBrand(value.cardNumber);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Cardholder name</Label>
        <Input
          placeholder="JOHN DOE"
          value={value.cardholderName}
          onChange={(e) => set({ cardholderName: e.target.value.toUpperCase() })}
          maxLength={50}
          autoComplete="cc-name"
          disabled={disabled}
        />
      </div>

      <FieldShell label="Card number">
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="numeric"
            value={value.cardNumber}
            onChange={(e) => set({ cardNumber: formatCardNumber(e.target.value) })}
            placeholder="0000 0000 0000 0000"
            autoComplete="cc-number"
            disabled={disabled}
            className="w-full flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
          />
          {brand ? (
            <div className={`h-5 w-8 shrink-0 rounded bg-gradient-to-br ${cardBrandClass(brand)}`} />
          ) : (
            <CreditCard className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </FieldShell>

      <div className="grid grid-cols-2 gap-3">
        <FieldShell label="Expiry (MM/YY)">
          <input
            type="text"
            inputMode="numeric"
            value={formatExpiryDisplay(value.expiry)}
            onChange={(e) => set({ expiry: e.target.value })}
            placeholder="MM/YY"
            autoComplete="cc-exp"
            disabled={disabled}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
          />
        </FieldShell>
        <FieldShell label="CVC">
          <input
            type="text"
            inputMode="numeric"
            value={value.cvc}
            onChange={(e) => set({ cvc: e.target.value.replace(/\D/g, "").slice(0, 4) })}
            placeholder="•••"
            autoComplete="cc-csc"
            disabled={disabled}
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
          />
        </FieldShell>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Billing street <span className="text-muted-foreground">(optional)</span></Label>
        <Input
          placeholder="123 Main St"
          value={value.billingLine1}
          onChange={(e) => set({ billingLine1: e.target.value })}
          autoComplete="address-line1"
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">City <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            placeholder="City"
            value={value.billingCity}
            onChange={(e) => set({ billingCity: e.target.value })}
            autoComplete="address-level2"
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">ZIP <span className="text-muted-foreground">(optional)</span></Label>
          <Input
            placeholder="10001"
            value={value.billingZip}
            onChange={(e) => set({ billingZip: e.target.value.toUpperCase() })}
            maxLength={10}
            autoComplete="postal-code"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
