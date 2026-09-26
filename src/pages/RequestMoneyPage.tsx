import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { HandCoins, Copy, Search, X, CheckCircle, Clock, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import CreateMoneyRequestModal from "@/components/request-money/CreateMoneyRequestModal";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";
import { edgeFunctionErrorMessage } from "@/lib/invokeEdgeFunction";
import { currencySymbol } from "@/lib/currency";
import { LIVE_PAYIN_CURRENCIES } from "@/lib/retailPayoutFees";

type Row = {
  id: string;
  short_code: string;
  short_url: string | null;
  amount: number;
  currency: string;
  status: "pending" | "awaiting_payment" | "paid" | "expired" | "cancelled" | "failed";
  note: string | null;
  payer_hint_name: string | null;
  payer_name: string | null;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
};

const STATUS_STYLES: Record<Row["status"], { icon: typeof Clock; cls: string; label: string }> = {
  pending: { icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", label: "Open" },
  awaiting_payment: { icon: Clock, cls: "bg-sky-500/15 text-sky-700 dark:text-sky-400", label: "Awaiting pay" },
  paid: { icon: CheckCircle, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", label: "Paid" },
  expired: { icon: AlertCircle, cls: "bg-muted text-muted-foreground", label: "Expired" },
  cancelled: { icon: X, cls: "bg-muted text-muted-foreground", label: "Cancelled" },
  failed: { icon: AlertCircle, cls: "bg-destructive/15 text-destructive", label: "Failed" },
};

const RequestMoneyPage = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "open" | "paid" | "closed">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["money-requests", user?.id],
    queryFn: async () => {
      await supabase
        .from("money_requests" as never)
        .update({ status: "expired" } as never)
        .eq("requester_id", user!.id)
        .in("status", ["pending", "awaiting_payment"])
        .lt("expires_at", new Date().toISOString());
      const { data, error } = await supabase
        .from("money_requests" as never)
        .select(
          "id,short_code,short_url,amount,currency,status,note,payer_hint_name,payer_name,expires_at,created_at,paid_at",
        )
        .eq("requester_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as unknown as Row[]) ?? [];
    },
    enabled: !!user,
  });

  const counts = useMemo(() => ({
    all: rows.length,
    open: rows.filter((r) => ["pending", "awaiting_payment"].includes(r.status)).length,
    paid: rows.filter((r) => r.status === "paid").length,
    closed: rows.filter((r) => ["expired", "cancelled", "failed"].includes(r.status)).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "open" && !["pending", "awaiting_payment"].includes(r.status)) return false;
      if (tab === "paid" && r.status !== "paid") return false;
      if (tab === "closed" && !["expired", "cancelled", "failed"].includes(r.status)) return false;
      if (!q) return true;
      return (
        r.short_code.toLowerCase().includes(q)
        || (r.note || "").toLowerCase().includes(q)
        || (r.payer_hint_name || "").toLowerCase().includes(q)
        || (r.payer_name || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, tab]);

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  const cancelRequest = async (id: string) => {
    setBusyId(id);
    try {
      const { data, error } = await supabase.functions.invoke("money-request-cancel", { body: { id } });
      if (error) throw new Error(await edgeFunctionErrorMessage(error));
      if (data?.error) throw new Error(String(data.error));
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["money-requests", user?.id] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not cancel");
    } finally {
      setBusyId(null);
    }
  };

  return (
      <AppPage width="wide" innerClassName="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Request money</h1>
            <p className="text-sm text-muted-foreground">
              Share a link so family or friends can pay into any of your wallets ({LIVE_PAYIN_CURRENCIES.join(", ")}).
            </p>
          </div>
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New request
          </Button>
        </div>

        <PageHeroBanner
          icon={HandCoins}
          label="Request money"
          value={`${counts.all} request${counts.all === 1 ? "" : "s"}`}
          meta={[
            { icon: Clock, text: `${counts.open} open · ${counts.paid} paid` },
            { icon: AlertCircle, text: `${counts.closed} closed` },
          ]}
          variant="sky"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search note, name, or code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
              <TabsTrigger value="paid">Paid ({counts.paid})</TabsTrigger>
              <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={HandCoins}
                title="No requests yet"
                description="Create a link and send it to someone who should top up your wallet."
                action={
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" /> Create request
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => {
              const st = STATUS_STYLES[r.status];
              const Icon = st.icon;
              const url = r.short_url || `${window.location.origin}/pay/${r.short_code}`;
              return (
                <li key={r.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-display font-semibold tabular-nums">
                          {currencySymbol(r.currency)}
                          {Number(r.amount).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          <span className="text-sm font-medium text-muted-foreground">{r.currency}</span>
                        </p>
                        <Badge variant="secondary" className={st.cls}>
                          <Icon className="mr-1 h-3 w-3" />
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {r.payer_name || r.payer_hint_name || "Anyone with the link"}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        {" · "}
                        {r.status === "paid" && r.paid_at
                          ? `Paid ${formatDistanceToNow(new Date(r.paid_at), { addSuffix: true })}`
                          : `Expires ${new Date(r.expires_at).toLocaleDateString()}`}
                        {" · "}
                        {r.short_code}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["pending", "awaiting_payment"].includes(r.status) && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyLink(url)}>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={busyId === r.id}
                            onClick={() => cancelRequest(r.id)}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <CreateMoneyRequestModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => qc.invalidateQueries({ queryKey: ["money-requests", user?.id] })}
        />
      </AppPage>
  );
};

export default RequestMoneyPage;
