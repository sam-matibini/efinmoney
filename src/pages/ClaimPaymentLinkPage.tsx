import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, Landmark, Zap, CreditCard, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeJs } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe";
import { tokenizeDebitCard } from "@/lib/stripePayouts";

type Resolved = {
  code: string;
  amount: number;
  currency: string;
  recipient_name: string | null;
  note: string | null;
  status: "pending" | "claimed" | "expired" | "revoked" | "failed";
  expires_at: string;
  sender_name: string;
  preset?: { method: string; label: string } | null;
  auto_claim?: boolean;
  claimed_method?: string | null;
  claimed_at?: string | null;
};

type Rail = "interac" | "card_push" | "eft";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const elementWrapperClass =
  "rounded-md border border-input bg-background px-3 py-2.5 text-sm focus-within:ring-2 focus-within:ring-ring";

const ClaimInner = ({ link, code }: { link: Resolved; code: string }) => {
  const stripe = useStripe();
  const elements = useElements();

  const [rail, setRail] = useState<Rail>("interac");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inst, setInst] = useState("");
  const [transit, setTransit] = useState("");
  const [acct, setAcct] = useState("");
  const [cardNumComplete, setCardNumComplete] = useState(false);
  const [cardExpComplete, setCardExpComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  // KYC fields for Visa Direct (Stripe Custom account requirements)
  const [dobDay, setDobDay] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [phone, setPhone] = useState("");
  const [addrLine1, setAddrLine1] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrPostal, setAddrPostal] = useState("");
  const [tosAccepted, setTosAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ method: Rail } | null>(null);

  const cardComplete = cardNumComplete && cardExpComplete && cardCvcComplete;

  const kycValid = useMemo(() => {
    const d = parseInt(dobDay, 10), m = parseInt(dobMonth, 10), y = parseInt(dobYear, 10);
    if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900) return false;
    const dob = new Date(y, m - 1, d);
    const age = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 18 || age > 120) return false;
    if (!/^\+?\d[\d\s\-()]{7,16}$/.test(phone)) return false;
    if (addrLine1.trim().length < 3) return false;
    if (addrCity.trim().length < 2) return false;
    if (!/^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/.test(addrState)) return false;
    if (!/^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$/.test(addrPostal.trim())) return false;
    if (!tosAccepted) return false;
    return true;
  }, [dobDay, dobMonth, dobYear, phone, addrLine1, addrCity, addrState, addrPostal, tosAccepted]);

  const isValid = useMemo(() => {
    if (name.trim().length < 2) return false;
    if (rail === "interac") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (rail === "eft") return /^\d{3}$/.test(inst) && /^\d{5}$/.test(transit) && acct.length >= 4;
    if (rail === "card_push") return cardComplete && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && kycValid;
    return false;
  }, [rail, name, email, inst, transit, acct, cardComplete, kycValid]);

  const handleSubmit = async () => {
    if (!link || !code) return;
    setSubmitting(true);
    try {
      let payload: any = {};
      if (rail === "eft") {
        payload = { institution_number: inst, transit_number: transit, account_number: acct };
      } else if (rail === "card_push") {
        if (!stripe || !elements) throw new Error("Card form not ready");
        const cardEl = elements.getElement(CardNumberElement);
        if (!cardEl) throw new Error("Card form not ready");
        const tok = await tokenizeDebitCard(stripe, cardEl, { name: name.trim(), currency: "cad" });
        payload = {
          card_token: tok.token,
          card_last4: tok.last4,
          card_brand: tok.brand,
          kyc: {
            dob: { day: parseInt(dobDay, 10), month: parseInt(dobMonth, 10), year: parseInt(dobYear, 10) },
            phone: phone.trim(),
            address: {
              line1: addrLine1.trim(),
              city: addrCity.trim(),
              state: addrState.trim().toUpperCase(),
              postal_code: addrPostal.trim().toUpperCase().replace(/\s+/g, ""),
              country: "CA",
            },
          },
          tos: { accepted: true },
        };
      }

      const res = await fetch(`${FUNCTIONS_BASE}/payment-link-claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({
          code,
          method: rail,
          recipient_name: name.trim(),
          recipient_email: email.trim() || undefined,
          payload,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Claim failed");
      setDone({ method: rail });
      toast.success("Payment claimed");
    } catch (e: any) {
      toast.error(e.message || "Claim failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-4">
        <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
        <h2 className="text-2xl font-display font-bold">You're getting paid!</h2>
        <p className="text-muted-foreground">
          {link.currency} {Number(link.amount).toFixed(2)} from <strong>{link.sender_name}</strong> is on its way via{" "}
          {done.method === "interac" ? "Interac e-Transfer" : done.method === "eft" ? "Bank Transfer" : "Visa Direct (debit card)"}.
        </p>
      </CardContent></Card>
    );
  }

  return (
    <Card className="max-w-lg w-full">
      <CardHeader>
        <CardTitle>You've got a payment</CardTitle>
        <div className="mt-2 p-4 rounded-xl bg-muted">
          <p className="text-sm text-muted-foreground">From {link.sender_name}</p>
          <p className="text-4xl font-display font-bold mt-1">
            {link.currency} {Number(link.amount).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {link.note && <p className="text-sm text-muted-foreground mt-2 italic">"{link.note}"</p>}
          <p className="text-[11px] text-muted-foreground mt-2">
            Expires {new Date(link.expires_at).toLocaleString()}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>How would you like to receive it?</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <Button variant={rail === "interac" ? "default" : "outline"} onClick={() => setRail("interac")} className="flex-col h-auto py-3">
              <Zap className="w-5 h-5 mb-1" /><span className="text-xs">Interac</span>
            </Button>
            <Button
              variant={rail === "card_push" ? "default" : "outline"}
              onClick={() => setRail("card_push")}
              className="flex-col h-auto py-3"
              disabled={link.currency !== "CAD"}
            >
              <CreditCard className="w-5 h-5 mb-1" /><span className="text-xs">Debit card</span>
            </Button>
            <Button variant={rail === "eft" ? "default" : "outline"} onClick={() => setRail("eft")} className="flex-col h-auto py-3">
              <Landmark className="w-5 h-5 mb-1" /><span className="text-xs">Bank (EFT)</span>
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Your full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
        </div>

        {rail === "interac" && (
          <div className="space-y-2">
            <Label>Your email (for Interac deposit)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        )}

        {rail === "eft" && (
          <>
            <div className="space-y-2">
              <Label>Email (for receipt)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Institution # (3 digits)</Label>
                <Input inputMode="numeric" maxLength={3} value={inst} onChange={(e) => setInst(e.target.value.replace(/\D/g, ""))} placeholder="001" /></div>
              <div className="space-y-2"><Label>Transit # (5 digits)</Label>
                <Input inputMode="numeric" maxLength={5} value={transit} onChange={(e) => setTransit(e.target.value.replace(/\D/g, ""))} placeholder="12345" /></div>
            </div>
            <div className="space-y-2"><Label>Account number</Label>
              <Input inputMode="numeric" value={acct} onChange={(e) => setAcct(e.target.value.replace(/\D/g, ""))} placeholder="1234567" /></div>
          </>
        )}

        {rail === "card_push" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Email (for receipt)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Debit card number</Label>
              <div className={elementWrapperClass}>
                <CardNumberElement
                  options={{ showIcon: true, placeholder: "Canadian debit card" }}
                  onChange={(e) => setCardNumComplete(e.complete)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Expiry</Label>
                <div className={elementWrapperClass}>
                  <CardExpiryElement onChange={(e) => setCardExpComplete(e.complete)} className="w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>CVC</Label>
                <div className={elementWrapperClass}>
                  <CardCvcElement onChange={(e) => setCardCvcComplete(e.complete)} className="w-full" />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Canadian debit cards only (Visa Debit, Debit Mastercard, Interac). Funds arrive in seconds via Visa Direct.
            </p>

            <div className="pt-3 border-t space-y-3">
              <p className="text-sm font-medium">Verify it's you</p>
              <p className="text-[11px] text-muted-foreground -mt-2">
                Required by our payments partner to send funds to your card.
              </p>

              <div className="space-y-2">
                <Label>Date of birth</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input inputMode="numeric" maxLength={2} placeholder="DD" value={dobDay}
                    onChange={(e) => setDobDay(e.target.value.replace(/\D/g, ""))} />
                  <Input inputMode="numeric" maxLength={2} placeholder="MM" value={dobMonth}
                    onChange={(e) => setDobMonth(e.target.value.replace(/\D/g, ""))} />
                  <Input inputMode="numeric" maxLength={4} placeholder="YYYY" value={dobYear}
                    onChange={(e) => setDobYear(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Phone number</Label>
                <Input type="tel" placeholder="+1 416 555 0100" value={phone}
                  onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Street address</Label>
                <Input placeholder="123 Main St" value={addrLine1}
                  onChange={(e) => setAddrLine1(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input placeholder="Toronto" value={addrCity}
                    onChange={(e) => setAddrCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Province</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={addrState}
                    onChange={(e) => setAddrState(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {["AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"].map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Postal code</Label>
                <Input placeholder="M5H 1A1" value={addrPostal}
                  onChange={(e) => setAddrPostal(e.target.value.toUpperCase())} />
              </div>

              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={tosAccepted}
                  onChange={(e) => setTosAccepted(e.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <a href="https://stripe.com/legal/ssa" target="_blank" rel="noreferrer" className="underline">
                    Stripe Services Agreement
                  </a>{" "}
                  and the eFinMoney Terms.
                </span>
              </label>
            </div>
          </div>
        )}

        <Button className="w-full" size="lg" disabled={!isValid || submitting} onClick={handleSubmit}>
          {submitting ? "Claiming…" : `Receive ${link.currency} ${Number(link.amount).toFixed(2)}`}
        </Button>
        <p className="text-[11px] text-muted-foreground text-center">
          By claiming you confirm the details above are yours. eFinMoney protects payment links with encryption and fraud monitoring.
        </p>
      </CardContent>
    </Card>
  );
};

const ClaimPaymentLinkPage = () => {
  const { code } = useParams<{ code: string }>();
  const [link, setLink] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [stripeP] = useState<Promise<StripeJs | null>>(() => getStripe());

  useEffect(() => {
    (async () => {
      if (!code) return;
      try {
        const res = await fetch(`${FUNCTIONS_BASE}/payment-link-resolve?code=${encodeURIComponent(code)}`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || "Failed to load link");
        setLink(j);
      } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
    })();
  }, [code]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground bg-payout-waves">Loading…</div>;
  if (err || !link) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-payout-waves">
        <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <h2 className="text-xl font-display font-bold">Link unavailable</h2>
          <p className="text-sm text-muted-foreground">{err || "This payment link could not be found."}</p>
          <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
        </CardContent></Card>
      </div>
    );
  }

  if (link.status !== "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-payout-waves">
        <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-3">
          <Clock className="w-10 h-10 mx-auto text-muted-foreground" />
          <h2 className="text-xl font-display font-bold capitalize">Link {link.status}</h2>
          <p className="text-sm text-muted-foreground">
            This payment link is no longer available. Ask the sender for a new one.
          </p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-payout-waves">
      <Elements stripe={stripeP}>
        <ClaimInner link={link} code={code!} />
      </Elements>
    </div>
  );
};

export default ClaimPaymentLinkPage;
