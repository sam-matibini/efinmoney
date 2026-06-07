import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/FloatingLabelInput";
import { PremiumContinueButton } from "@/components/ui/PremiumContinueButton";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CrossmintProvider, CrossmintEmbeddedCheckout } from "@crossmint/client-sdk-react-ui";
import CrossmintSuccessScreen from "@/components/crossmint/CrossmintSuccessScreen";

type Status = "pending" | "card_charged" | "usdc_received" | "payout_sent" | "pending_payout" | "success" | "failed" | "cancelled";

const STAGES: { key: Status; label: string }[] = [
  { key: "pending", label: "Awaiting card payment" },
  { key: "card_charged", label: "Card charged" },
  { key: "usdc_received", label: "USDC received on Stellar" },
  { key: "payout_sent", label: "Payout sent to bank" },
  { key: "success", label: "Delivered to recipient" },
];

export default function AfricanCardSendPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [sourceCurrency, setSourceCurrency] = useState<"USD" | "CAD">("USD");
  const [sourceAmount, setSourceAmount] = useState("");
  const [country] = useState("NG");
  const [destCurrency] = useState("NGN");
  const [recipientName, setRecipientName] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [transferId, setTransferId] = useState<string | null>(params.get("transfer") ?? null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [clientApiKey, setClientApiKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [failure, setFailure] = useState<string | null>(null);

  // Realtime subscription
  useEffect(() => {
    if (!transferId) return;
    supabase
      .from("crossmint_yellowcard_transfers")
      .select("status, crossmint_checkout_url, failure_reason")
      .eq("id", transferId)
      .single()
      .then(({ data }) => {
        if (data) {
          setStatus(data.status as Status);
          setCheckoutUrl(data.crossmint_checkout_url);
          setFailure(data.failure_reason);
        }
      });

    const channel = supabase
      .channel(`cmyc-${transferId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "crossmint_yellowcard_transfers", filter: `id=eq.${transferId}` },
        (payload) => {
          const row = payload.new as any;
          setStatus(row.status);
          setFailure(row.failure_reason ?? null);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [transferId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("crossmint-create-order", {
        body: {
          source_currency: sourceCurrency,
          source_amount: Number(sourceAmount),
          destination_currency: destCurrency,
          destination_country: country,
          recipient_name: recipientName,
          recipient_bank_name: bankName,
          recipient_bank_code: bankCode,
          recipient_account_number: accountNumber,
          recipient_phone: phone,
          recipient_email: email,
        },
      });
      if (error) throw error;
      setTransferId(data.transfer_id);
      setCheckoutUrl(data.checkout_url);
      setOrderId(data.order_id ?? null);
      setClientSecret(data.client_secret ?? null);
      setClientApiKey(data.client_api_key ?? null);
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank");
      }
      toast.success("Transfer created — complete card payment below.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not create transfer");
    } finally {
      setLoading(false);
    }
  }

  const stageIndex = STAGES.findIndex((s) => s.key === status);
  const isDone = status === "success";
  const isFailed = status === "failed" || status === "cancelled";
  const isPendingPayout = status === "pending_payout";

  return (
    <div className="container mx-auto max-w-2xl py-8 px-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Send to Africa</h1>
        <p className="text-muted-foreground">Card-funded transfer via Crossmint → USDC → Yellow Card bank deposit</p>
      </div>

      {!transferId ? (
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle>Recipient & amount</CardTitle>
            <CardDescription>Currently supports Nigeria (NGN). More corridors coming.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Amount row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex gap-2">
                    <FloatingLabelInput
                      label="Amount"
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={sourceAmount}
                      onChange={(e) => setSourceAmount(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={sourceCurrency} onValueChange={(v: any) => setSourceCurrency(v)}>
                      <SelectTrigger className="w-28 h-14 rounded-xl border-input shadow-card focus:border-primary focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.10),0_0_24px_-6px_hsl(var(--primary)/0.22)] transition-all duration-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex flex-col justify-center">
                  <div className="relative h-14 rounded-xl border border-input bg-muted/60 px-4 pt-5 pb-1.5 text-sm text-muted-foreground shadow-card">
                    <span className="absolute left-4 top-2.5 text-[11px] font-medium text-primary">Recipient gets</span>
                    <span className="block truncate">NGN (auto-converted)</span>
                  </div>
                </div>
              </div>

              <FloatingLabelInput
                label="Recipient full name"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-3">
                <FloatingLabelInput
                  label="Bank name"
                  required
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. Access Bank"
                />
                <FloatingLabelInput
                  label="Bank code"
                  value={bankCode}
                  onChange={(e) => setBankCode(e.target.value)}
                  placeholder="e.g. 044"
                />
              </div>

              <FloatingLabelInput
                label="Account number"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-3">
                <FloatingLabelInput
                  label="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <FloatingLabelInput
                  label="Email (optional)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <PremiumContinueButton type="submit" loading={loading}>
                <ArrowRight className="h-4 w-4" />
                Continue to card payment
              </PremiumContinueButton>
            </form>
          </CardContent>
        </Card>
      ) : isDone && transferId ? (
        <CrossmintSuccessScreen transferId={transferId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Transfer progress</CardTitle>
            <CardDescription>ID: {transferId.slice(0, 8)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {orderId && clientSecret && clientApiKey && (status === "pending") && (
              <div className="rounded-md border bg-background p-2">
                <CrossmintProvider apiKey={clientApiKey}>
                  <CrossmintEmbeddedCheckout
                    orderId={orderId}
                    clientSecret={clientSecret}
                    payment={{
                      fiat: { enabled: true, allowedMethods: { card: true, applePay: true, googlePay: true } },
                      crypto: { enabled: false },
                      defaultMethod: "fiat",
                    }}
                  />
                </CrossmintProvider>
              </div>
            )}
            {checkoutUrl && status === "pending" && !clientSecret && (
              <Button asChild className="w-full">
                <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">Open card payment</a>
              </Button>
            )}
            {orderId && status === "pending" && !clientApiKey && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
                Card form unavailable: <code>CROSSMINT_CLIENT_API_KEY</code> is not set.
              </div>
            )}

            <div className="space-y-3">
              {STAGES.map((s, i) => {
                const reached = stageIndex >= i || isDone;
                const isCurrent = stageIndex === i && !isDone && !isFailed;
                return (
                  <div key={s.key} className="flex items-center gap-3">
                    {reached ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : isCurrent ? (
                      <Clock className="h-5 w-5 text-primary" />
                    ) : (
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className={reached ? "" : "text-muted-foreground"}>{s.label}</span>
                  </div>
                );
              })}
            </div>

            {isPendingPayout && (
              <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm">
                <Badge variant="outline" className="mb-1">Awaiting Yellow Card</Badge>
                <p>USDC received. Yellow Card credentials are not yet configured — admin will release the NGN payout manually until onboarding completes.</p>
              </div>
            )}
            {isFailed && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm flex gap-2 items-start">
                <XCircle className="h-5 w-5 text-destructive shrink-0" />
                <div>
                  <div className="font-medium">Transfer failed</div>
                  {failure && <p className="text-muted-foreground">{failure}</p>}
                </div>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => navigate("/transfers")}>
              View all transfers
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
