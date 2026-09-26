import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  HandCoins,
  Loader2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { FINCRA_CAD_INTERAC_ALIAS } from "@/lib/fincraCad";
import { bankLink, readRememberedBank, rememberInteracBank } from "@/components/payments/checkoutStrings";
import BankPicker from "@/components/payments/BankPicker";
import { currencySymbol } from "@/lib/currency";

type BankVa = {
  bank_name: string;
  account_number: string;
  account_name: string;
  currency_code: string;
};

type Resolved = {
  code: string;
  amount: number;
  currency: string;
  note: string | null;
  status: string;
  expires_at: string;
  paid_at?: string | null;
  payer_hint_name?: string | null;
  requester_name: string;
  pay_methods: string[];
  bank_va?: BankVa | null;
};

type PayStart = {
  ok: boolean;
  method: string;
  alias?: string;
  reference?: string;
  amount: number;
  currency?: string;
  instructions: string[];
  payment_link?: string;
  bank_va?: BankVa;
  fallback_method?: string;
};

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function formatAmt(amount: number, currency: string): string {
  const sym = currencySymbol(currency);
  return `${sym}${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FUNCTIONS_BASE}/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      ...(init?.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

const METHOD_LABEL: Record<string, string> = {
  interac: "Interac Autodeposit",
  bank_va: "Bank transfer",
  checkout: "Card / mobile money",
};

const PayMoneyRequestPage = () => {
  const { code = "" } = useParams();
  const [link, setLink] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payerName, setPayerName] = useState("");
  const [payerEmail, setPayerEmail] = useState("");
  const [bank, setBank] = useState(() => readRememberedBank() || "");
  const [method, setMethod] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const [pay, setPay] = useState<PayStart | null>(null);

  const refresh = useCallback(async () => {
    if (!code) return;
    const data = await api<Resolved>(`money-request-resolve?code=${encodeURIComponent(code)}`);
    setLink(data);
    return data;
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await refresh();
        if (cancelled || !data) return;
        const methods = data.pay_methods?.length ? data.pay_methods : [];
        setMethod((prev) => (prev && methods.includes(prev) ? prev : methods[0] || ""));
        if (data.payer_hint_name && !payerName) setPayerName(data.payer_hint_name);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Link not found");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed payer hint once
  }, [refresh]);

  useEffect(() => {
    if (!link || !["pending", "awaiting_payment"].includes(link.status)) return;
    const t = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(t);
  }, [link?.status, refresh]);

  const startPay = async (overrideMethod?: string) => {
    if (!link) return;
    const payMethod = overrideMethod || method;
    setStarting(true);
    try {
      if (bank && payMethod === "interac") rememberInteracBank(bank);
      const data = await api<PayStart>("money-request-start-pay", {
        method: "POST",
        body: JSON.stringify({
          code: link.code,
          method: payMethod,
          payer_name: payerName.trim() || null,
          payer_email: payerEmail.trim() || null,
          payer_bank: payMethod === "interac" ? bank || null : null,
          redirect_url: `${window.location.origin}/pay/${link.code}`,
        }),
      });
      setPay(data);
      await refresh();
      if (data.method === "checkout" && data.payment_link) {
        toast.success("Opening secure checkout…");
        window.location.href = data.payment_link;
        return;
      }
      toast.success(
        data.method === "interac"
          ? "Interac details ready — send from your bank"
          : "Bank details ready — transfer the exact amount",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setStarting(false);
    }
  };

  const openBank = () => {
    const url = bankLink(bank || readRememberedBank());
    if (!url) {
      toast.error("Select your bank first");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyText = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const currency = link?.currency || "CAD";
  const needsEmail = method === "checkout";
  const needsName = method === "interac" || method === "checkout" || method === "bank_va";
  const canContinue =
    !!method
    && (!needsName || !!payerName.trim())
    && (!needsEmail || !!payerEmail.trim());

  return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50 via-background to-background dark:from-sky-950/20">
        <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-4 py-8">
          <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
            <HandCoins className="h-4 w-4 text-sky-600" />
            <span>eFinMoney · Request money</span>
          </div>

          {loading ? (
            <div className="flex flex-1 items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error || !link ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
              <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
              <h1 className="text-xl font-display font-bold">Link unavailable</h1>
              <p className="text-sm text-muted-foreground">{error || "This pay link was not found."}</p>
              <Button asChild variant="outline">
                <Link to="/">Go to eFinMoney</Link>
              </Button>
            </div>
          ) : link.status === "paid" ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-card p-8 text-center space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h1 className="text-2xl font-display font-bold">Payment received</h1>
              <p className="text-sm text-muted-foreground">
                {formatAmt(link.amount, currency)} is in {link.requester_name}&apos;s eFinMoney wallet.
              </p>
            </div>
          ) : ["expired", "cancelled", "failed"].includes(link.status) ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
              <Clock className="mx-auto h-10 w-10 text-muted-foreground" />
              <h1 className="text-xl font-display font-bold">
                {link.status === "expired" ? "This link expired" : "This link is closed"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Ask {link.requester_name} to send a new request.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-6 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paying · {currency}
                </p>
                <p className="text-3xl font-display font-bold tabular-nums">
                  {formatAmt(link.amount, currency)}
                </p>
                <p className="text-sm text-muted-foreground">
                  to <span className="font-medium text-foreground">{link.requester_name}</span>
                  {link.note ? ` · ${link.note}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(link.expires_at).toLocaleString()}
                </p>
              </div>

              {!pay ? (
                <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold">How will you pay?</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      You don&apos;t need an eFinMoney account. Pick a method below.
                    </p>
                  </div>

                  {(link.pay_methods?.length ?? 0) > 1 && (
                    <div className="grid gap-2">
                      {link.pay_methods.map((m) => {
                        const Icon = m === "interac" ? HandCoins : m === "bank_va" ? Building2 : CreditCard;
                        const active = method === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMethod(m)}
                            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                              active
                                ? "border-sky-500 bg-sky-500/10"
                                : "border-border hover:bg-muted/40"
                            }`}
                          >
                            <Icon className={`h-5 w-5 ${active ? "text-sky-600" : "text-muted-foreground"}`} />
                            <span className="font-medium">{METHOD_LABEL[m] || m}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(link.pay_methods?.length ?? 0) === 1 && (
                    <p className="text-sm text-muted-foreground">
                      Paying with {METHOD_LABEL[method] || method}.
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label>Your name</Label>
                    <Input
                      placeholder="As on your bank or mobile money account"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Your email{" "}
                      <span className="font-normal text-muted-foreground">
                        {needsEmail ? "" : "(optional)"}
                      </span>
                    </Label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                    />
                  </div>
                  {method === "interac" && (
                    <div className="space-y-2">
                      <Label>Your bank</Label>
                      <BankPicker
                        value={bank}
                        onChange={(v) => {
                          setBank(v);
                          rememberInteracBank(v);
                        }}
                      />
                    </div>
                  )}
                  <Button
                    className="w-full h-12"
                    disabled={starting || !canContinue}
                    onClick={() => startPay()}
                  >
                    {starting ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Preparing…
                      </span>
                    ) : method === "checkout" ? (
                      "Continue to checkout"
                    ) : method === "bank_va" ? (
                      "Show bank details"
                    ) : (
                      "Continue to Interac details"
                    )}
                  </Button>
                </div>
              ) : pay.method === "interac" ? (
                <div className="rounded-2xl border border-sky-500/30 bg-card p-6 space-y-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Send Interac Autodeposit</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send exactly {formatAmt(pay.amount, "CAD")} to{" "}
                      <span className="font-medium text-foreground">
                        {pay.alias || FINCRA_CAD_INTERAC_ALIAS}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      Put this in the message field
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-base font-semibold">{pay.reference}</code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => copyText(pay.reference || "", "Payment code")}
                      >
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </Button>
                    </div>
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    {pay.instructions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  <Button type="button" className="w-full h-12 gap-2" onClick={openBank}>
                    Open my bank <ExternalLink className="h-4 w-4" />
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    This page updates automatically when the deposit matches.
                  </p>
                </div>
              ) : pay.method === "bank_va" && pay.bank_va ? (
                <div className="rounded-2xl border border-sky-500/30 bg-card p-6 space-y-4">
                  <div>
                    <h2 className="font-display text-lg font-semibold">Transfer to this account</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Send exactly {formatAmt(pay.amount, pay.currency || currency)}. Use the exact amount so we can match this request.
                    </p>
                  </div>
                  <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
                    {[
                      ["Bank", pay.bank_va.bank_name],
                      ["Account number", pay.bank_va.account_number],
                      ["Account name", pay.bank_va.account_name],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                          <p className="font-medium">{value}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5 shrink-0"
                          onClick={() => copyText(value, label)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
                    {pay.instructions.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                  {link.pay_methods.includes("checkout") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={starting}
                      onClick={() => {
                        setPay(null);
                        setMethod("checkout");
                      }}
                    >
                      Prefer card / mobile money instead?
                    </Button>
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    This page updates automatically when the deposit credits their wallet.
                  </p>
                </div>
              ) : pay.method === "checkout" ? (
                <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Redirecting to secure checkout…</p>
                  {pay.payment_link && (
                    <Button asChild variant="outline">
                      <a href={pay.payment_link}>Open checkout</a>
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <p className="mt-auto pt-10 text-center text-xs text-muted-foreground">
            Powered by eFinMoney · Funds credit the recipient&apos;s wallet after matching
          </p>
        </div>
      </div>
  );
};

export default PayMoneyRequestPage;
