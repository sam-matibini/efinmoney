import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Lock, ShieldCheck } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { cardBrandLabel } from "@/lib/cardBrand";
import { SYSTEM_DEFAULT_CURRENCY, SYSTEM_DEFAULT_COUNTRY } from "@/lib/systemDefaults";

interface Props {
  onSuccess?: () => void;
  onCancel?: () => void;
  ctaLabel?: string;
}

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "NGN"];

/** Detect the network from the leading digits. */
export const detectBrand = (digits: string): string => {
  if (/^4/.test(digits)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "mastercard";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^6(?:011|5|4[4-9])/.test(digits)) return "discover";
  return "card";
};

const luhnValid = (digits: string): boolean => {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return digits.length > 0 && sum % 10 === 0;
};

const groupNumber = (digits: string, brand: string) =>
  brand === "amex"
    ? digits.replace(/^(\d{0,4})(\d{0,6})(\d{0,5}).*$/, (_m, a, b, c) => [a, b, c].filter(Boolean).join(" "))
    : digits.replace(/(.{4})/g, "$1 ").trim();

const schema = z.object({
  name: z.string().trim().min(1, "Cardholder name is required").max(50, "Name must be under 50 characters"),
  number: z
    .string()
    .regex(/^\d{13,19}$/, "Enter a valid card number")
    .refine(luhnValid, "That card number is not valid"),
  expiry: z
    .string()
    .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Expiry must be MM/YY")
    .refine((v) => {
      const [mm, yy] = v.split("/").map(Number);
      const exp = new Date(2000 + yy, mm, 1);
      return exp > new Date();
    }, "That card has expired"),
  cvv: z.string().regex(/^\d{3,4}$/, "CVV must be 3 or 4 digits"),
  postal: z.string().trim().max(12, "Postal code is too long").optional().or(z.literal("")),
  currency: z.string().length(3),
});

export default function ManualCardForm({ onSuccess, onCancel, ctaLabel }: Props) {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [postal, setPostal] = useState("");
  const [currency, setCurrency] = useState(SYSTEM_DEFAULT_CURRENCY);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const digits = number.replace(/\D/g, "");
  const brand = detectBrand(digits);
  const maxDigits = brand === "amex" ? 15 : 19;

  const handleNumber = (value: string) => {
    const d = value.replace(/\D/g, "").slice(0, 19);
    setNumber(groupNumber(d, detectBrand(d)));
  };

  const handleExpiry = (value: string) => {
    const d = value.replace(/\D/g, "").slice(0, 4);
    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return toast.error("Please sign in first");

    const parsed = schema.safeParse({ name, number: digits, expiry, cvv, postal, currency });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return toast.error(parsed.error.issues[0].message);
    }
    setErrors({});

    const [mm, yy] = parsed.data.expiry.split("/").map(Number);
    setSaving(true);
    try {
      if (makeDefault) {
        await supabase
          .from("saved_payment_methods")
          .update({ is_default: false })
          .eq("user_id", user.id);
      }

      // Only the display record is stored — the full number and CVV never leave this form.
      const { error } = await supabase.from("saved_payment_methods").insert({
        user_id: user.id,
        stripe_customer_id: "manual",
        stripe_payment_method_id: `manual_${crypto.randomUUID()}`,
        card_brand: brand,
        last_four: parsed.data.number.slice(-4),
        exp_month: mm,
        exp_year: 2000 + yy,
        cardholder_name: parsed.data.name,
        currency_code: parsed.data.currency,
        country_code: (profile?.country_code || SYSTEM_DEFAULT_COUNTRY).toUpperCase().slice(0, 2),
        is_default: makeDefault,
      });
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ["saved-cards", user.id] });
      toast.success(`${cardBrandLabel(brand)} •••• ${parsed.data.number.slice(-4)} saved`);
      setName(""); setNumber(""); setExpiry(""); setCvv(""); setPostal("");
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
        <span>
          We save only the brand, last 4 digits and expiry. The full number and CVV are never stored —
          you enter them again at payment time.
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="mc-name">Cardholder Name</Label>
        <Input
          id="mc-name"
          placeholder="JOHN DOE"
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          maxLength={50}
          autoComplete="cc-name"
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="mc-number">Card Number</Label>
          {digits.length >= 2 && brand !== "card" && (
            <span className="text-xs text-muted-foreground">{cardBrandLabel(brand)}</span>
          )}
        </div>
        <Input
          id="mc-number"
          inputMode="numeric"
          placeholder="1234 5678 9012 3456"
          value={number}
          onChange={(e) => handleNumber(e.target.value)}
          autoComplete="cc-number"
          className="font-mono tracking-wider"
        />
        {errors.number && <p className="text-xs text-destructive">{errors.number}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="mc-exp">Expiry (MM/YY)</Label>
          <Input
            id="mc-exp"
            inputMode="numeric"
            placeholder="08/30"
            value={expiry}
            onChange={(e) => handleExpiry(e.target.value)}
            autoComplete="cc-exp"
          />
          {errors.expiry && <p className="text-xs text-destructive">{errors.expiry}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="mc-cvv">CVV</Label>
          <Input
            id="mc-cvv"
            inputMode="numeric"
            type="password"
            placeholder={brand === "amex" ? "4 digits" : "3 digits"}
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
            autoComplete="cc-csc"
          />
          {errors.cvv && <p className="text-xs text-destructive">{errors.cvv}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="mc-postal">Billing Postal Code</Label>
          <Input
            id="mc-postal"
            placeholder="Optional"
            value={postal}
            onChange={(e) => setPostal(e.target.value.toUpperCase())}
            maxLength={12}
            autoComplete="postal-code"
          />
          {errors.postal && <p className="text-xs text-destructive">{errors.postal}</p>}
        </div>
        <div className="space-y-2">
          <Label>Charge Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Label htmlFor="mc-default" className="text-sm font-normal">Set as default card</Label>
        <Switch id="mc-default" checked={makeDefault} onCheckedChange={setMakeDefault} />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button type="submit" className="flex-1" disabled={saving || digits.length < 13 || digits.length > maxDigits}>
          {saving ? (<><LoadingSpinner size={16} className="mr-2" /> Saving…</>) : (ctaLabel ?? "Save Card")}
        </Button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" /> Card details are encrypted in transit
      </p>
    </form>
  );
}
