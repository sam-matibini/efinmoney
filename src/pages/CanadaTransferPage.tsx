import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, ArrowRight, CheckCircle2, AlertCircle, Info } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { toast } from "sonner";
import { usePinGate } from "@/components/send/usePinGate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { usePlaidLink } from "react-plaid-link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LOOP_CAD_INTERAC_ALIAS } from "@/lib/loopCad";

interface PlaidAccountRow {
  id: string;
  name: string;
  mask: string | null;
  subtype: string | null;
  institution_number: string | null;
  branch_number: string | null;
  account_number: string | null;
  item_id: string;
}

export default function CanadaTransferPage() {
  const { user } = useAuth();
  const { requirePin, pinGate } = usePinGate();
  const { data: wallets } = useWallets();
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [lastResult, setLastResult] = useState<{
    state: "success" | "failed";
    reference?: string;
    error?: string;
    error_code?: string;
    message?: string;
  } | null>(null);

  const cadWallets = (wallets || []).filter((w: { currency_code: string }) => w.currency_code === "CAD");

  const { data: accounts = [] } = useQuery({
    queryKey: ["plaid_accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("plaid_accounts")
        .select("id,name,mask,subtype,institution_number,branch_number,account_number,item_id, plaid_items(institution_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Array<PlaidAccountRow & { plaid_items?: { institution_name?: string } }>;
    },
    enabled: !!user,
  });

  const fetchLinkToken = useCallback(async () => {
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("plaid-create-link-token");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLinkToken(data.link_token);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start bank login");
    } finally {
      setLinking(false);
    }
  }, []);

  const onSuccess = useCallback(async (public_token: string, metadata: { institution?: { name?: string } }) => {
    try {
      const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
        body: { public_token, institution: metadata.institution },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Linked ${metadata.institution?.name || "bank"}`);
      qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });
      const firstId = Array.isArray(data?.account_ids) ? data.account_ids[0] : null;
      if (firstId) setSelectedAccount(firstId);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not link bank");
    } finally {
      setLinkToken(null);
    }
  }, [qc, user?.id]);

  const { open, ready } = usePlaidLink({
    token: linkToken || "",
    onSuccess,
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  const handleSubmit = async () => {
    if (!selectedAccount || !selectedWallet || !amount) {
      toast.error("Please complete all fields");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt < 1) {
      toast.error("Min transfer: $1.00 CAD");
      return;
    }
    setSubmitting(true);
    setLastResult(null);
    try {
      // Re-open bank login is optional on this page — account already linked via Plaid.
      const { data, error } = await supabase.functions.invoke("intra-ca-transfer-create", {
        body: {
          plaid_account_id: selectedAccount,
          destination_wallet_id: selectedWallet,
          amount_cad: amt,
          description,
          purpose: "topup",
        },
      });
      if (error) throw error;

      if (data?.fallback || data?.success === false) {
        const msg = data?.error || "Transfer failed";
        toast.error(msg);
        setLastResult({ state: "failed", error: msg, error_code: data?.error_code, reference: data?.transfer?.reference });
        return;
      }
      if (data?.error) throw new Error(data.error);

      setLastResult({
        state: "success",
        reference: data.reference,
        message: data.message,
      });
      toast.success(`Authorized ${data.reference} — settling via Loop Bank`);
      setAmount("");
      setDescription("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Intra-Canada Transfer</h1>
          <p className="text-muted-foreground">
            Top up your CAD wallet by signing into your bank with <strong>Plaid</strong>. Funds collect to{" "}
            <strong>Loop Bank</strong> ({LOOP_CAD_INTERAC_ALIAS}) — no Stripe micro-deposits, no copy/paste.
          </p>
        </div>

        <Alert className="mb-6 border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Live mode.</strong> Open your Canadian bank login through Plaid to authorize the transfer request.
            Wallet credit completes when Loop matches the deposit to your reference.
          </AlertDescription>
        </Alert>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Step 1 — Linked Canadian banks
            </CardTitle>
            <CardDescription>Connect via Plaid bank login (instant auth — no micro-deposits).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No bank linked yet.</p>
            )}
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{a.plaid_items?.institution_name || "Bank"} — {a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ••{a.mask} · {a.subtype}
                  </div>
                </div>
                <CheckCircle2 className="w-5 h-5 text-primary" />
              </div>
            ))}
            <Button onClick={fetchLinkToken} disabled={linking} variant="outline" className="w-full">
              {linking ? <LoadingSpinner size={16} className="mr-2" /> : <Building2 className="w-4 h-4 mr-2" />}
              {accounts.length > 0 ? "Link another bank" : "Open bank login"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5" /> Step 2 — Authorize pay-in to Loop Bank
            </CardTitle>
            <CardDescription>Authorize from a linked account — settlement via Loop Autodeposit/EFT.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>From bank account</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger><SelectValue placeholder="Choose linked bank account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.plaid_items?.institution_name || "Bank"} — {a.name} ••{a.mask}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>To CAD wallet</Label>
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger><SelectValue placeholder="Choose your CAD wallet" /></SelectTrigger>
                <SelectContent>
                  {cadWallets.map((w: { wallet_id: string; balance: number }) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      CAD wallet — current: ${Number(w.balance).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cadWallets.length === 0 && (
                <p className="text-xs text-amber-500">You don't have a CAD wallet yet. Create one from the Wallets page.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Amount (CAD)</Label>
              <Input
                type="number" step="0.01" min="1" max="25000"
                placeholder="100.00" value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Min $1.00 · Max $25,000.00 CAD per transaction</p>
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input placeholder="e.g. Rent reimbursement" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <Alert className="bg-muted/40">
              <AlertDescription className="text-xs">
                By submitting you authorize eFinMoney to request this CAD amount from your selected bank via Plaid.
                Funds settle to Loop Bank; your wallet credits when the deposit matches your reference.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => requirePin(handleSubmit, `$${amount || "0.00"} CAD`)}
              disabled={submitting || !selectedAccount || !selectedWallet || !amount}
              className="w-full"
              size="lg"
            >
              {submitting ? <LoadingSpinner size={16} className="mr-2" /> : null}
              {submitting ? "Authorizing…" : `Authorize $${amount || "0.00"} CAD → Loop`}
            </Button>

            {lastResult?.state === "success" && (
              <Alert className="border-emerald-500/30 bg-emerald-500/5">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <AlertDescription>
                  <div className="font-medium">Transfer {lastResult.reference} authorized</div>
                  <div className="text-xs mt-1 text-muted-foreground">
                    {lastResult.message || `Settling to Loop Bank (${LOOP_CAD_INTERAC_ALIAS}).`}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {lastResult?.state === "failed" && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium">Transfer failed</div>
                  <div className="text-xs mt-1">{lastResult.error}</div>
                  {lastResult.error_code === "bank_account_blocked" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={fetchLinkToken}
                      disabled={linking}
                    >
                      {linking ? <LoadingSpinner size={16} className="mr-2" /> : <Building2 className="w-4 h-4 mr-2" />}
                      Link a different bank
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
      {pinGate}
    </>
  );
}
