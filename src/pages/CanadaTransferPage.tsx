import { useEffect, useState, useCallback } from "react";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, ArrowRight, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWallets } from "@/hooks/useWallets";
import { usePlaidLink } from "react-plaid-link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const { data: wallets } = useWallets();
  const qc = useQueryClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [lastResult, setLastResult] = useState<any>(null);

  const cadWallets = (wallets || []).filter((w: any) => w.currency_code === "CAD");

  const { data: accounts = [], refetch } = useQuery({
    queryKey: ["plaid_accounts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("plaid_accounts")
        .select("id,name,mask,subtype,institution_number,branch_number,account_number,item_id, plaid_items(institution_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
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
    } catch (e: any) {
      toast.error(e.message || "Could not start Plaid Link");
    } finally {
      setLinking(false);
    }
  }, []);

  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    try {
      const { data, error } = await supabase.functions.invoke("plaid-exchange-token", {
        body: { public_token, institution: metadata.institution },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Linked ${metadata.institution?.name || "bank"} (${data.accounts} accounts)`);
      qc.invalidateQueries({ queryKey: ["plaid_accounts", user?.id] });
    } catch (e: any) {
      toast.error(e.message || "Could not link bank");
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
      const { data, error } = await supabase.functions.invoke("intra-ca-transfer-create", {
        body: {
          plaid_account_id: selectedAccount,
          destination_wallet_id: selectedWallet,
          amount_cad: amt,
          description,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);
      toast.success(`Transfer ${data.reference} initiated (Stripe: ${data.stripe_status})`);
      setAmount("");
      setDescription("");
    } catch (e: any) {
      toast.error(e.message || "Transfer failed");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAcct = accounts.find((a) => a.id === selectedAccount) as PlaidAccountRow | undefined;
  const missingEft = selectedAcct && (!selectedAcct.institution_number || !selectedAcct.account_number);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Intra-Canada Transfer</h1>
          <p className="text-muted-foreground">
            Top up your CAD wallet from any Canadian bank using <strong>Plaid + Stripe Pre-Authorized Debit (PAD)</strong>.
          </p>
        </div>

        <Alert className="mb-6 border-primary/30 bg-primary/5">
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Live mode.</strong> You will link your real Canadian bank account through Plaid and authorize a Pre-Authorized Debit (PAD). Funds will be debited from your actual account.
          </AlertDescription>
        </Alert>

        {/* Step 1: Link bank */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" /> Step 1 — Linked Canadian banks
            </CardTitle>
            <CardDescription>Connect via Plaid to access your account & routing numbers securely.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No bank linked yet.</p>
            )}
            {accounts.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <div className="font-medium">{a.plaid_items?.institution_name || "Bank"} — {a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ••{a.mask} · {a.subtype}
                    {a.institution_number ? (
                      <span className="ml-2"> · EFT {a.institution_number}-{a.branch_number}</span>
                    ) : (
                      <span className="ml-2 text-amber-500">· No EFT numbers (sandbox limitation)</span>
                    )}
                  </div>
                </div>
                {a.institution_number ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
              </div>
            ))}
            <Button onClick={fetchLinkToken} disabled={linking} variant="outline" className="w-full">
              {linking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Building2 className="w-4 h-4 mr-2" />}
              {accounts.length > 0 ? "Link another bank" : "Link your Canadian bank"}
            </Button>
          </CardContent>
        </Card>

        {/* Step 2: Transfer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="w-5 h-5" /> Step 2 — Send money to your wallet
            </CardTitle>
            <CardDescription>Funds settle to your CAD wallet via PAD.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>From bank account</Label>
              <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                <SelectTrigger><SelectValue placeholder="Choose linked bank account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.plaid_items?.institution_name || "Bank"} — {a.name} ••{a.mask}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {missingEft && (
                <p className="text-xs text-amber-500">
                  This account is missing EFT routing numbers — Stripe PAD cannot be initiated. Try linking a different account.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>To CAD wallet</Label>
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger><SelectValue placeholder="Choose your CAD wallet" /></SelectTrigger>
                <SelectContent>
                  {cadWallets.map((w: any) => (
                    <SelectItem key={w.wallet_id} value={w.wallet_id}>
                      🇨🇦 CAD wallet — current: ${Number(w.balance).toFixed(2)}
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
                By submitting you authorize eFinMoney to debit the amount from the selected bank using Pre-Authorized Debit (PAD), per Stripe's mandate terms.
              </AlertDescription>
            </Alert>

            <Button onClick={handleSubmit} disabled={submitting || !selectedAccount || !selectedWallet || !amount} className="w-full" size="lg">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {submitting ? "Processing PAD…" : `Transfer $${amount || "0.00"} CAD`}
            </Button>

            {lastResult && (
              <Alert className="border-green-500/30 bg-green-500/5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  <div className="font-medium">Transfer {lastResult.reference} created</div>
                  <div className="text-xs mt-1">
                    Stripe status: <Badge variant="outline">{lastResult.stripe_status}</Badge>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
