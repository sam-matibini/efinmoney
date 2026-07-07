import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { getClaimKyc } from "@/lib/stripeCorridors";

export type RecipientKycValue = {
  dob: { day: number; month: number; year: number };
  phone: string;
  address: {
    line1: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  };
};

type Props = {
  currency?: string;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  phone: string;
  addrLine1: string;
  addrCity: string;
  addrState: string;
  addrPostal: string;
  tosAccepted: boolean;
  onDobDay: (v: string) => void;
  onDobMonth: (v: string) => void;
  onDobYear: (v: string) => void;
  onPhone: (v: string) => void;
  onAddrLine1: (v: string) => void;
  onAddrCity: (v: string) => void;
  onAddrState: (v: string) => void;
  onAddrPostal: (v: string) => void;
  onTosAccepted: (v: boolean) => void;
};

export function isRecipientKycValid(
  currency: string,
  fields: {
    dobDay: string;
    dobMonth: string;
    dobYear: string;
    phone: string;
    addrLine1: string;
    addrCity: string;
    addrState: string;
    addrPostal: string;
    tosAccepted: boolean;
  },
): boolean {
  const spec = getClaimKyc(currency);
  if (!spec) return false;
  const day = parseInt(fields.dobDay, 10);
  const month = parseInt(fields.dobMonth, 10);
  const year = parseInt(fields.dobYear, 10);
  if (!Number.isFinite(day) || day < 1 || day > 31) return false;
  if (!Number.isFinite(month) || month < 1 || month > 12) return false;
  if (!Number.isFinite(year) || year < 1900 || year > new Date().getFullYear()) return false;
  if (fields.phone.trim().length < 8) return false;
  if (fields.addrLine1.trim().length < 3 || fields.addrCity.trim().length < 2) return false;
  const postal = fields.addrPostal.trim().toUpperCase().replace(/\s+/g, "");
  if (!new RegExp(spec.postalRegex).test(postal)) return false;
  if (spec.stateLabel && !spec.states?.some((s) => s.code === fields.addrState.trim().toUpperCase())) return false;
  return fields.tosAccepted;
}

export function buildRecipientKycPayload(
  currency: string,
  fields: {
    dobDay: string;
    dobMonth: string;
    dobYear: string;
    phone: string;
    addrLine1: string;
    addrCity: string;
    addrState: string;
    addrPostal: string;
  },
): RecipientKycValue {
  const spec = getClaimKyc(currency)!;
  return {
    dob: {
      day: parseInt(fields.dobDay, 10),
      month: parseInt(fields.dobMonth, 10),
      year: parseInt(fields.dobYear, 10),
    },
    phone: fields.phone.trim(),
    address: {
      line1: fields.addrLine1.trim(),
      city: fields.addrCity.trim(),
      ...(spec.stateLabel ? { state: fields.addrState.trim().toUpperCase() } : {}),
      postal_code: fields.addrPostal.trim().toUpperCase().replace(/\s+/g, ""),
      country: spec.countries[0]?.iso ?? "CA",
    },
  };
}

export default function RecipientStripeKycFields({
  currency = "CAD",
  dobDay,
  dobMonth,
  dobYear,
  phone,
  addrLine1,
  addrCity,
  addrState,
  addrPostal,
  tosAccepted,
  onDobDay,
  onDobMonth,
  onDobYear,
  onPhone,
  onAddrLine1,
  onAddrCity,
  onAddrState,
  onAddrPostal,
  onTosAccepted,
}: Props) {
  const spec = getClaimKyc(currency);
  if (!spec) return null;

  return (
    <div className="pt-3 border-t space-y-3">
      <p className="text-sm font-medium">Recipient identity (Stripe)</p>
      <p className="text-[11px] text-muted-foreground -mt-2">
        Required for instant debit-card payouts. Use a real Canadian address that matches the cardholder.
      </p>

      <div className="space-y-2">
        <Label>Date of birth</Label>
        <div className="grid grid-cols-3 gap-2">
          <Input inputMode="numeric" maxLength={2} placeholder="DD" value={dobDay} onChange={(e) => onDobDay(e.target.value.replace(/\D/g, ""))} />
          <Input inputMode="numeric" maxLength={2} placeholder="MM" value={dobMonth} onChange={(e) => onDobMonth(e.target.value.replace(/\D/g, ""))} />
          <Input inputMode="numeric" maxLength={4} placeholder="YYYY" value={dobYear} onChange={(e) => onDobYear(e.target.value.replace(/\D/g, ""))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Phone number</Label>
        <Input type="tel" placeholder="+1 416 555 0100" value={phone} onChange={(e) => onPhone(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label>Street address</Label>
        <Input placeholder="123 Main St" value={addrLine1} onChange={(e) => onAddrLine1(e.target.value)} />
      </div>

      <div className={spec.stateLabel ? "grid grid-cols-2 gap-3" : "space-y-2"}>
        <div className="space-y-2">
          <Label>City</Label>
          <Input placeholder="City" value={addrCity} onChange={(e) => onAddrCity(e.target.value)} />
        </div>
        {spec.stateLabel && (
          <div className="space-y-2">
            <Label>{spec.stateLabel}</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={addrState}
              onChange={(e) => onAddrState(e.target.value)}
            >
              <option value="">Select…</option>
              {(spec.states ?? []).map((s) => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>{spec.postalLabel}</Label>
        <Input placeholder={currency === "CAD" ? "M5H 2N2" : "Postal code"} value={addrPostal} onChange={(e) => onAddrPostal(e.target.value)} />
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox checked={tosAccepted} onCheckedChange={(v) => onTosAccepted(v === true)} className="mt-0.5" />
        <span>
          Recipient agrees to the{" "}
          <a href="https://stripe.com/legal/connect-account" target="_blank" rel="noreferrer" className="underline">Stripe Services Agreement</a>
          {" "}and eFinMoney Terms for card payouts.
        </span>
      </label>
    </div>
  );
}
