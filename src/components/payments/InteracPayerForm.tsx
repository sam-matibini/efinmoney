import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Lock } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BANK_ETRANSFER_LINKS,
  CA_PROVINCES,
  CHECKOUT_STRINGS,
  type Lang,
} from "@/components/payments/checkoutStrings";

export interface PayerForm {
  accountType: "personal" | "business";
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
  bank: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
}

export const emptyPayerForm: PayerForm = {
  accountType: "personal",
  phone: "",
  firstName: "",
  lastName: "",
  email: "",
  bank: "",
  line1: "",
  line2: "",
  city: "",
  region: "",
  postalCode: "",
};

interface Props {
  lang: Lang;
  value: PayerForm;
  onChange: (next: PayerForm) => void;
  amountLabel: string;
  /** Editable amount (top-up); omitted when the amount is fixed. */
  amount?: string;
  onAmountChange?: (value: string) => void;
  submitting?: boolean;
  error?: string | null;
  onSubmit: () => void;
}

/**
 * Single-step payer form: identity + billing address, then one Pay button.
 * Everything after this is automated — no copy/paste checklist.
 */
export default function InteracPayerForm({
  lang,
  value,
  onChange,
  amountLabel,
  amount,
  onAmountChange,
  submitting = false,
  error,
  onSubmit,
}: Props) {
  const t = CHECKOUT_STRINGS[lang];
  const set = <K extends keyof PayerForm>(key: K, next: PayerForm[K]) =>
    onChange({ ...value, [key]: next });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {onAmountChange && (
        <div className="space-y-1.5">
          <Label htmlFor="etx-amount">{t.amountDue} (CAD)</Label>
          <Input
            id="etx-amount"
            type="number"
            min={1}
            step="0.01"
            value={amount ?? ""}
            onChange={(e) => onAmountChange(e.target.value)}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t.accountType}</Label>
          <Select
            value={value.accountType}
            onValueChange={(v) => set("accountType", v as PayerForm["accountType"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="personal">{t.personal}</SelectItem>
              <SelectItem value="business">{t.business}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="etx-phone">{t.phone}</Label>
          <Input
            id="etx-phone"
            type="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="+1 416 555 0134"
            value={value.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="etx-first">{t.firstName}</Label>
          <Input
            id="etx-first"
            autoComplete="given-name"
            maxLength={60}
            value={value.firstName}
            onChange={(e) => set("firstName", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="etx-last">{t.lastName}</Label>
          <Input
            id="etx-last"
            autoComplete="family-name"
            maxLength={60}
            value={value.lastName}
            onChange={(e) => set("lastName", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="etx-email">{t.email}</Label>
        <Input
          id="etx-email"
          type="email"
          autoComplete="email"
          maxLength={255}
          value={value.email}
          onChange={(e) => set("email", e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t.bank}</Label>
        <Select value={value.bank} onValueChange={(v) => set("bank", v)}>
          <SelectTrigger>
            <SelectValue placeholder={t.bank} />
          </SelectTrigger>
          <SelectContent>
            {BANK_ETRANSFER_LINKS.map((b) => (
              <SelectItem key={b.name} value={b.name}>
                {b.name}
              </SelectItem>
            ))}
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 pt-1">
        <p className="text-sm font-medium">{t.billingAddress}</p>
        <Input
          aria-label={t.line1}
          placeholder={t.line1}
          autoComplete="address-line1"
          maxLength={200}
          value={value.line1}
          onChange={(e) => set("line1", e.target.value)}
        />
        <Input
          aria-label={t.line2}
          placeholder={t.line2}
          autoComplete="address-line2"
          maxLength={200}
          value={value.line2}
          onChange={(e) => set("line2", e.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <Input
            aria-label={t.city}
            placeholder={t.city}
            autoComplete="address-level2"
            maxLength={100}
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
          />
          <Select value={value.region} onValueChange={(v) => set("region", v)}>
            <SelectTrigger aria-label={t.province}>
              <SelectValue placeholder={t.province} />
            </SelectTrigger>
            <SelectContent>
              {CA_PROVINCES.map((p) => (
                <SelectItem key={p.code} value={p.code}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            aria-label={t.postal}
            placeholder={t.postal}
            autoComplete="postal-code"
            maxLength={10}
            value={value.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
          />
          <Input aria-label={t.country} value="Canada" readOnly className="bg-muted/40" />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
        {t.pay(amountLabel)}
      </Button>
    </form>
  );
}
