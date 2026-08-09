import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Copy, Landmark, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

type Intent = {
  id: string;
  amount: number;
  currency_code: string;
  reference: string;
  status: string;
  expires_at?: string;
  sender_name?: string | null;
  sender_email?: string | null;
  sender_bank?: string | null;
};

const senderSchema = z.object({
  amount: z.coerce.number().min(1, "Enter an amount of at least CAD 1.00"),
  senderName: z.string().trim().min(2, "Enter the sender's full name").max(100, "Name is too long"),
  senderEmail: z.string().trim().email("Enter a valid email address").max(255, "Email is too long"),
  senderBank: z.string().trim().max(100, "Bank name is too long"),
});

export default function CadInteracTopUpCard({ walletId, walletCurrency, onComplete, initialAmount }: Props) {
  const currency = walletCurrency.toUpperCase();
  const [amount, setAmount] = useState(initialAmount ?? "");
  useEffect(() => {
    if (initialAmount != null && initialAmount !== "") setAmount(initialAmount);
  }, [initialAmount]);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [senderBank, setSenderBank] = useState("");
  const [loading, setLoading] = useState(false);
  const [alias, setAlias] = useState<string | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [configured, setConfigured] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Prefill the sender from the signed-in profile so the form is mostly done
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
      const fullName = String(meta.full_name ?? meta.name ?? "").trim();
      setSenderName((prev) => prev || fullName);
      setSenderEmail((prev) => prev || (data.user!.email ?? ""));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const createIntent = useCallback(async () => {
    const parsed = senderSchema.safeParse({ amount, senderName, senderEmail, senderBank });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? "Check your details");
      return;
    }
    setLoading(true);
    setAutoError(null);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-cad-interac", {
        body: {
          action: "create",
          amount: parsed.data.amount,
          wallet_id: walletId,
          sender_name: parsed.data.senderName,
          sender_email: parsed.data.senderEmail,
          sender_bank: parsed.data.senderBank || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAlias((prev) => data.alias ?? prev);
      setIntent(data.intent);
      setInstructions(Array.isArray(data.instructions) ? data.instructions : []);
      toast.message("Interac details ready", {
        description: "Send the exact amount from your bank app.",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not start Interac top-up";
      setAutoError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [amount, senderName, senderEmail, senderBank, walletId]);

  useEffect(() => {
    if (currency !== "CAD") return;
    let cancelled = false;
    void (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-cad-interac`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token || ""}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
            },
          },
        );
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          setAlias(json.alias ?? null);
          setConfigured(Boolean(json.configured));
          const pending = Array.isArray(json.pending) ? json.pending[0] : null;
          if (pending) setIntent(pending);
        }
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency]);

  // Focus the form as soon as the tab opens so it acts like a checkout
  useEffect(() => {
    if (currency !== "CAD" || !bootstrapped || intent) return;
    nameRef.current?.focus();
  }, [currency, bootstrapped, intent]);


  // Poll active intent
  useEffect(() => {
    if (!intent || intent.status !== "pending") return;
    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled || attempts > 80) return;
      attempts += 1;
      try {
        const session = (await supabase.auth.getSession()).data.session;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fincra-cad-interac?intent_id=${encodeURIComponent(intent.id)}`,
          { headers: { Authorization: `Bearer ${session?.access_token || ""}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } },
        );
        const json = await res.json();
        const next = json?.intent as Intent | undefined;
        if (next) {
          setIntent(next);
          if (next.status === "completed") {
            toast.success(`CAD ${next.amount} credited to your wallet`);
            onComplete?.();
            return;
          }
        }
      } catch {
        /* retry */
      }
      if (!cancelled) setTimeout(poll, 5000);
    };

    const t = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [intent?.id, intent?.status, onComplete]);

  if (currency !== "CAD") return null;




  const copyAlias = async () => {
    if (!alias) return;
    await navigator.clipboard.writeText(alias);
    toast.success("Interac address copied");
  };

  if (intent?.status === "completed") {
    return (
      <Card className="border-emerald-500/30">
        <CardContent className="pt-6 text-center space-y-2">
          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
          <p className="font-medium">CAD {intent.amount} credited</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-500/30 bg-gradient-to-br from-red-950/10 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-red-600" />
          Interac e-Transfer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Send CAD from your Canadian bank. Autodeposit credits your wallet when the transfer arrives.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && !intent && !loading && (
          <p className="text-sm text-muted-foreground">
            Interac details are being prepared — try again in a moment.
          </p>
        )}

        {autoError && !intent && (
          <p className="text-sm text-destructive">{autoError}</p>
        )}

        {!intent && loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing Interac details…
          </div>
        )}

        {!intent && !loading && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void createIntent();
            }}
          >
            <p className="text-sm font-medium">Your e-Transfer details</p>
            <div className="space-y-2">
              <Label htmlFor="etx-amount">Amount (CAD)</Label>
              <Input
                id="etx-amount"
                type="number"
                min={1}
                step="0.01"
                placeholder="e.g. 25"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Minimum CAD 1.00 · Send this exact amount</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="etx-name">Sender full name</Label>
              <Input
                id="etx-name"
                ref={nameRef}
                autoComplete="name"
                maxLength={100}
                placeholder="As it appears on your bank account"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="etx-email">Sender email</Label>
              <Input
                id="etx-email"
                type="email"
                autoComplete="email"
                maxLength={255}
                placeholder="you@example.com"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Send the e-Transfer from this email so we can match it.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="etx-bank">Sending bank (optional)</Label>
              <Input
                id="etx-bank"
                maxLength={100}
                placeholder="e.g. RBC, TD, Scotiabank"
                value={senderBank}
                onChange={(e) => setSenderBank(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!(Number(amount) > 0)}>
              {autoError ? "Try again" : "Continue"}
            </Button>
          </form>
        )}


        {intent && intent.status === "pending" && (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Send exactly</span>
                <span className="font-semibold tabular-nums">CAD {Number(intent.amount).toFixed(2)}</span>
              </div>
              {(intent.sender_name || intent.sender_email) && (
                <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                  <span>Sending from</span>
                  <span className="text-right break-all">
                    {[intent.sender_name, intent.sender_email, intent.sender_bank].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}

              {alias && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Interac recipient</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm break-all">{alias}</code>
                    <Button type="button" size="sm" variant="outline" onClick={copyAlias}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Reference (put this in the message field)</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm break-all">{intent.reference}</code>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(intent.reference);
                      toast.success("Reference copied");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>

            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              {(instructions.length ? instructions : [
                "Open your Canadian banking app and start an Interac e-Transfer.",
                `Send exactly CAD ${Number(intent.amount).toFixed(2)} to the address above.`,
                "Autodeposit is on — no security question.",
                "This page updates when your wallet is credited.",
              ]).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Waiting for your Interac transfer…
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
