import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Activity, Coins, CreditCard, Globe2, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Status = "idle" | "checking" | "healthy" | "warning" | "failed";

interface CheckResult {
  service: string;
  status: "healthy" | "warning" | "failed";
  message: string;
  details?: Record<string, unknown>;
}

const SERVICES = [
  { key: "stellar", name: "Stellar Mainnet", description: "Treasury wallet on Horizon (Mainnet)", Icon: Coins },
  { key: "elicate", name: "Zambia (Elicate Pay)", description: "Mobile money payouts — ZMW", Icon: Globe2 },
  { key: "stripe", name: "Stripe (Cards)", description: "Card charges & Visa Direct payouts", Icon: CreditCard },
  { key: "paysafe", name: "Paysafe (Canada)", description: "Interac e-Transfer & EFT payouts", Icon: Banknote },
] as const;

type ServiceKey = (typeof SERVICES)[number]["key"];

const PulseDot = ({ status }: { status: Status }) => {
  const color =
    status === "healthy"
      ? "bg-indigo-500"
      : status === "warning"
        ? "bg-amber-500"
        : status === "failed"
          ? "bg-red-500"
          : "bg-muted-foreground/40";
  const pulse = status === "healthy" || status === "failed" || status === "warning";
  return (
    <span className="relative inline-flex h-3 w-3">
      {pulse && (
        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", color)} />
      )}
      <span className={cn("relative inline-flex h-3 w-3 rounded-full", color)} />
    </span>
  );
};

const StatusBadge = ({ status }: { status: Status }) => {
  const map: Record<Status, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    idle: { label: "Not checked", variant: "outline" },
    checking: { label: "Checking…", variant: "secondary" },
    healthy: { label: "Live / Healthy", variant: "default" },
    warning: { label: "Warning", variant: "secondary" },
    failed: { label: "Connection Failed", variant: "destructive" },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

const formatDetails = (key: ServiceKey, details?: Record<string, unknown>) => {
  if (!details) return null;
  if (key === "stellar") {
    const xlm = details.xlm as string | undefined;
    const usdc = details.usdc as string | null | undefined;
    const pub = details.publicKey as string | undefined;
    return (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between border-b border-border/40 pb-1">
          <span className="text-muted-foreground">XLM Balance</span>
          <span className="font-mono font-semibold">{xlm ?? "0"} XLM</span>
        </div>
        <div className="flex justify-between border-b border-border/40 pb-1">
          <span className="text-muted-foreground">USDC Balance</span>
          <span className="font-mono font-semibold">
            {usdc != null ? `${usdc} USDC` : "No trustline"}
          </span>
        </div>
        {pub && (
          <div className="pt-1">
            <div className="text-xs text-muted-foreground mb-1">Treasury Public Key</div>
            <code className="block text-[10px] font-mono break-all bg-muted/40 rounded p-2">{pub}</code>
            <a
              href={`https://stellar.expert/explorer/public/account/${pub}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              View on Stellar Expert →
            </a>
          </div>
        )}
      </div>
    );
  }
  if (key === "stripe") {
    const balances = (details.balances as Array<{ currency: string; amount: number }>) ?? [];
    const mode = details.mode as string | undefined;
    return (
      <div className="space-y-2 text-sm">
        {mode && (
          <div className="flex justify-between border-b border-border/40 pb-1">
            <span className="text-muted-foreground">Mode</span>
            <span className="font-mono uppercase font-semibold">{mode}</span>
          </div>
        )}
        {balances.length === 0 ? (
          <div className="text-xs text-muted-foreground">No available balance reported.</div>
        ) : (
          balances.map((b) => (
            <div key={b.currency} className="flex justify-between border-b border-border/40 pb-1">
              <span className="text-muted-foreground">{b.currency.toUpperCase()} Available</span>
              <span className="font-mono font-semibold">{b.amount.toFixed(2)}</span>
            </div>
          ))
        )}
      </div>
    );
  }
  if (key === "paysafe") {
    return (
      <div className="text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Environment</span>
          <span className="font-mono uppercase font-semibold">{String(details.environment ?? "test")}</span>
        </div>
      </div>
    );
  }
  if (key === "elicate") {
    return (
      <div className="text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Endpoint</span>
          <span className="font-mono text-xs">{String(details.endpoint ?? "")}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">HTTP</span>
          <span className="font-mono">{String(details.httpStatus ?? "")}</span>
        </div>
      </div>
    );
  }
  return null;
};

const SystemDiagnosticsPage = () => {
  const [results, setResults] = useState<Record<ServiceKey, CheckResult | null>>({
    stellar: null,
    elicate: null,
    stripe: null,
    paysafe: null,
  });
  const [checking, setChecking] = useState<Record<ServiceKey, boolean>>({
    stellar: false,
    elicate: false,
    stripe: false,
    paysafe: false,
  });
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runChecks = async (service: ServiceKey | "all") => {
    const targets: ServiceKey[] = service === "all" ? SERVICES.map((s) => s.key) : [service];
    setChecking((c) => {
      const next = { ...c };
      targets.forEach((t) => (next[t] = true));
      return next;
    });
    try {
      const { data, error } = await supabase.functions.invoke("test-integrations", {
        body: { service },
      });
      if (error) throw error;
      const newResults = { ...results };
      (data?.results ?? []).forEach((r: CheckResult) => {
        newResults[r.service as ServiceKey] = r;
      });
      setResults(newResults);
      setLastChecked(new Date());
      const failed = (data?.results ?? []).filter((r: CheckResult) => r.status === "failed");
      if (failed.length === 0) {
        toast.success("All integrations responding");
      } else {
        toast.warning(`${failed.length} integration(s) failed`);
      }
    } catch (e) {
      toast.error((e as Error).message || "Diagnostic run failed");
    } finally {
      setChecking((c) => {
        const next = { ...c };
        targets.forEach((t) => (next[t] = false));
        return next;
      });
    }
  };

  const runAllMutation = useMutation({ mutationFn: () => runChecks("all") });

  const getStatus = (key: ServiceKey): Status => {
    if (checking[key]) return "checking";
    const r = results[key];
    if (!r) return "idle";
    return r.status;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              System Diagnostics
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time health of payment rails, blockchain treasury, and KYC providers.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastChecked && (
              <span className="text-xs text-muted-foreground">
                Last run: {lastChecked.toLocaleTimeString()}
              </span>
            )}
            <Button onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending}>
              <RefreshCw className={cn("h-4 w-4 mr-2", runAllMutation.isPending && "animate-spin")} />
              Run All Checks
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {SERVICES.map(({ key, name, description, Icon }) => {
            const status = getStatus(key);
            const r = results[key];
            return (
              <Card key={key} className="overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {name}
                        <PulseDot status={status} />
                      </CardTitle>
                      <CardDescription>{description}</CardDescription>
                    </div>
                  </div>
                  <StatusBadge status={status} />
                </CardHeader>
                <CardContent className="space-y-4">
                  {r?.message && (
                    <div
                      className={cn(
                        "text-sm rounded-md border p-3",
                        r.status === "healthy" && "border-indigo-500/30 bg-indigo-500/5 text-indigo-700 dark:text-indigo-300",
                        r.status === "warning" && "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
                        r.status === "failed" && "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300",
                      )}
                    >
                      {r.message}
                    </div>
                  )}
                  {formatDetails(key, r?.details)}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runChecks(key)}
                    disabled={checking[key]}
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-2", checking[key] && "animate-spin")} />
                    Test Connection
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
};

export default SystemDiagnosticsPage;
