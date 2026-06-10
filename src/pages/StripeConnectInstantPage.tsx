import { useEffect, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import { ConnectAccountOnboarding, ConnectComponentsProvider } from "@stripe/react-connect-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Zap, RefreshCw } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import BackToDashboard from "@/components/layout/BackToDashboard";
import { getConnectReadiness } from "@/hooks/useStripeConnectedAccount";

export default function StripeConnectInstantPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [connect, setConnect] = useState<any>(null);
  const [onboarded, setOnboarded] = useState(false);
  const connectState = getConnectReadiness(account);

  const refreshStatus = async (silent = false) => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-refresh-status", { body: {} });
      if (error) throw new Error(error.message);
      if (data?.account) {
        setAccount(data.account);
        if (!silent) toast.success(data.is_active ? "Account is active" : data?.message || "Still pending — finish onboarding");
      } else if (data?.exists === false && !silent) {
        toast.info("No connected account yet");
      }
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  // Load existing account, then auto-refresh from Stripe
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
      if (data) refreshStatus(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <LoadingSpinner size={24} />
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
                  <><LoadingSpinner size={16} className="mr-2" /> Creating…</>
                ) : (
                  "Create Connected Account"
                )}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className={`w-5 h-5 ${connectState.ready ? "text-emerald-500" : "text-amber-500"}`} />
                    Connected Account
                  </CardTitle>
                  <CardDescription>
                    <span className="font-mono text-xs">{account.stripe_account_id}</span> · {account.country?.toUpperCase()} · {connectState.status}
                  </CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={() => refreshStatus(false)} disabled={refreshing}>
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {onboarded || connectState.ready ? (
                <p className="text-sm text-emerald-500">Onboarding complete. You're ready to receive instant transfers.</p>
              ) : connect ? (
                <ConnectComponentsProvider connectInstance={connect}>
                  <ConnectAccountOnboarding
                    onExit={async () => {
                      setOnboarded(true);
                      toast.success("Onboarding finished — syncing status…");
                      await refreshStatus(true);
                    }}
                  />
                </ConnectComponentsProvider>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LoadingSpinner size={16} /> Loading onboarding…
                </div>
              )}
              {connectState.message && !connectState.ready && (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">{connectState.message}</p>
              )}
              {!connectState.ready && connectState.pendingItems.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground space-y-1">
                  {connectState.pendingItems.slice(0, 5).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
