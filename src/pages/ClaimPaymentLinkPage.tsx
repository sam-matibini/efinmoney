import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, Landmark, Zap, CreditCard, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Resolved = {
  code: string;
  amount: number;
  currency: string;
  recipient_name: string | null;
  note: string | null;
  status: "pending" | "claimed" | "expired" | "revoked" | "failed";
  expires_at: string;
  sender_name: string;
};

type Rail = "interac" | "card_push" | "eft";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

const ClaimPaymentLinkPage = () => {
  const { code } = useParams<{ code: string }>();
  const [link, setLink] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rail, setRail] = useState<Rail>("interac");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [inst, setInst] = useState("");
  const [transit, setTransit] = useState("");
  const [acct, setAcct] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ method: Rail } | null>(null);

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

  const isValid = useMemo(() => {
    if (name.trim().length < 2) return false;
    if (rail === "interac") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (rail === "eft") return /^\d{3}$/.test(inst) && /^\d{5}$/.test(transit) && acct.length >= 4;
    if (rail === "card_push") return false; // requires tokenization (TODO in v1)
    return false;
  }, [rail, name, email, inst, transit, acct]);

  const handleSubmit = async () => {
    if (!link || !code) return;
    setSubmitting(true);
    try {
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
          payload: rail === "eft"
            ? { institution_number: inst, transit_number: transit, account_number: acct }
            : {},
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Claim failed");
      setDone({ method: rail });
      toast.success("Payment claimed");
    } catch (e: any) {
      toast.error(e.message || "Claim failed");
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (err || !link) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
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
      <div className="min-h-screen flex items-center justify-center p-6">
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

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full"><CardContent className="py-10 text-center space-y-4">
          <CheckCircle className="w-12 h-12 mx-auto text-emerald-500" />
          <h2 className="text-2xl font-display font-bold">You're getting paid!</h2>
          <p className="text-muted-foreground">
            {link.currency} {Number(link.amount).toFixed(2)} from <strong>{link.sender_name}</strong> is on its way via{" "}
            {done.method === "interac" ? "Interac e-Transfer" : done.method === "eft" ? "Bank Transfer" : "Visa Direct"}.
          </p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-muted/30">
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
              <Button variant={rail === "card_push" ? "default" : "outline"} onClick={() => setRail("card_push")} className="flex-col h-auto py-3" disabled>
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
            <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
              Debit-card delivery is coming soon for the public claim page. Choose Interac or EFT for now.
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
    </div>
  );
};

export default ClaimPaymentLinkPage;
