import { useEffect, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { ConnectAccountOnboarding, ConnectComponentsProvider } from "@stripe/react-connect-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Zap } from "lucide-react";
import BackToDashboard from "@/components/layout/BackToDashboard";

export default function StripeConnectInstantPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [connect, setConnect] = useState<any>(null);
  const [onboarded, setOnboarded] = useState(false);

  // Load existing account
  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase
        .from("stripe_connected_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setAccount(data);
      setLoading(false);
    })();
  }, [user]);

  // Initialize Connect instance when we have an account
  useEffect(() => {
    if (!account) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("stripe-connect-account-session", {
          body: { component: "account_onboarding" },
        });
        if (error || !data?.client_secret) {
          throw new Error(error?.message || data?.error || "Failed to create account session");
        }
        const instance = await loadConnectAndInitialize({
          publishableKey: data.publishable_key,
          fetchClientSecret: async () => {
            const { data: refresh } = await supabase.functions.invoke("stripe-connect-account-session", {
              body: { component: "account_onboarding" },
            });
            return refresh?.client_secret || "";
          },
          appearance: { overlays: "dialog", variables: { colorPrimary: "#6366f1" } },
        });
        setConnect(instance);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to init Connect");
      }
    })();
  }, [account?.stripe_account_id]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-create-account", {
        body: { country: "ca" },
      });
      if (error || data?.error) {
        throw new Error(error?.message || data?.error || "Failed to create account");
      }
      setAccount(data.account);
      toast.success("Stripe connected account created");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <BackToDashboard />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-primary" />
            Stripe Instant Transfers
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect a Stripe account to receive instant transfers directly to your bank or debit card.
          </p>
        </div>

        {!account ? (
          <Card>
            <CardHeader>
              <CardTitle>Set up your connected account</CardTitle>
              <CardDescription>
                We'll create a Stripe connected account (full dashboard) for instant payouts. You'll complete onboarding in the next step.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating…</>
                ) : (
                  "Create Connected Account"
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Connected Account
              </CardTitle>
              <CardDescription>
                <span className="font-mono text-xs">{account.stripe_account_id}</span> · {account.country?.toUpperCase()} · {account.status}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {onboarded ? (
                <p className="text-sm text-emerald-500">Onboarding complete. You're ready to receive instant transfers.</p>
              ) : connect ? (
                <ConnectComponentsProvider connectInstance={connect}>
                  <ConnectAccountOnboarding
                    onExit={() => {
                      setOnboarded(true);
                      toast.success("Onboarding finished");
                    }}
                  />
                </ConnectComponentsProvider>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading onboarding…
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
