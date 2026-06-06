import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, CheckCircle2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CrossmintProvider, CrossmintEmbeddedCheckout } from "@crossmint/client-sdk-react-ui";

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
        <Card>
          <CardHeader>
            <CardTitle>Recipient & amount</CardTitle>
            <CardDescription>Currently supports Nigeria (NGN). More corridors coming.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>You send</Label>
                  <div className="flex gap-2">
                    <Input type="number" min="1" step="0.01" required value={sourceAmount} onChange={(e) => setSourceAmount(e.target.value)} />
                    <Select value={sourceCurrency} onValueChange={(v: any) => setSourceCurrency(v)}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="CAD">CAD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Recipient gets</Label>
                  <div className="flex items-center h-10 px-3 rounded-md border border-input bg-muted text-sm">NGN (auto-converted)</div>
                </div>
              </div>

              <div>
                <Label>Recipient full name</Label>
                <Input required value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bank name</Label>
                  <Input required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Access Bank" />
                </div>
                <div>
                  <Label>Bank code</Label>
                  <Input value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="e.g. 044" />
                </div>
              </div>
              <div>
                <Label>Account number</Label>
                <Input required value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Phone (optional)</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <Label>Email (optional)</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Continue to card payment
              </Button>
            </form>
          </CardContent>
        </Card>
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
                  <CrossmintEmbeddedCheckout orderId={orderId} clientSecret={clientSecret} />
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
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
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
