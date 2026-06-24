import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link2, Copy, Search, X, CheckCircle, Clock, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RevokePaymentLinkDialog } from "@/components/payment-links/RevokePaymentLinkDialog";
import CreatePaymentLinkModal from "@/components/payment-links/CreatePaymentLinkModal";

type Row = {
  id: string;
  short_code: string;
  short_url: string;
  amount: number;
  currency: string;
  status: "pending" | "claimed" | "expired" | "revoked" | "failed";
  recipient_name: string | null;
  recipient_note: string | null;
  expires_at: string;
  created_at: string;
  claimed_at: string | null;
  claimed_method: string | null;
  preset_method: string | null;
};

const STATUS_STYLES: Record<Row["status"], { icon: any; cls: string; label: string }> = {
  pending: { icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", label: "Pending" },
  claimed: { icon: CheckCircle, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", label: "Paid" },
  expired: { icon: AlertCircle, cls: "bg-muted text-muted-foreground", label: "Expired" },
  revoked: { icon: X, cls: "bg-muted text-muted-foreground", label: "Revoked" },
  failed: { icon: AlertCircle, cls: "bg-destructive/15 text-destructive", label: "Failed" },
};


const PaymentLinksPage = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "pending" | "claimed" | "expired">("all");
  const [revokeTarget, setRevokeTarget] = useState<Row | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["payment-link-payouts", user?.id],
    queryFn: async () => {
      // Best-effort auto-expire stale pending rows for this user
      await supabase
        .from("payment_link_payouts" as any)
        .update({ status: "expired" })
        .eq("sender_id", user!.id)
        .eq("status", "pending")
        .lt("expires_at", new Date().toISOString());
      const { data, error } = await supabase
        .from("payment_link_payouts" as any)
        .select("id,short_code,short_url,amount,currency,status,recipient_name,recipient_note,expires_at,created_at,claimed_at,claimed_method,preset_method")
        .eq("sender_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data as any[]) as Row[];
    },
    enabled: !!user,
  });


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (tab !== "all" && r.status !== tab) return false;
      if (!q) return true;
      return [r.short_code, r.recipient_name, r.recipient_note, r.short_url]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }, [rows, search, tab]);

  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter(r => r.status === "pending").length,
    claimed: rows.filter(r => r.status === "claimed").length,
    expired: rows.filter(r => ["expired", "revoked"].includes(r.status)).length,
  }), [rows]);

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { toast.error("Copy failed"); }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-link-revoke", { body: { code: revokeTarget.short_code } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Link revoked — funds returned to wallet");
      setRevokeTarget(null);
      qc.invalidateQueries({ queryKey: ["payment-link-payouts"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed to revoke");
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <main className="container px-4 py-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Payment links</h1>
            <p className="text-sm text-muted-foreground">Create and track claim links. Pending links can be revoked anytime.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New link
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by recipient or code" className="pl-9" />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
              <TabsTrigger value="claimed">Paid ({counts.claimed})</TabsTrigger>
              <TabsTrigger value="expired">Expired ({counts.expired})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-0">
            <EmptyState
              icon={Link2}
              title="No payment links yet"
              description="Create a link to hold funds in escrow until someone claims them."
              action={<Button onClick={() => setCreateOpen(true)}>New payment link</Button>}
            />
          </CardContent></Card>
        ) : (
          <Card><CardContent className="p-0">
            <ul className="divide-y divide-border">
              {filtered.map(r => {
                const S = STATUS_STYLES[r.status];
                const Icon = S.icon;
                return (
                  <li key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-bold text-lg">
                          {r.currency} {Number(r.amount).toFixed(2)}
                        </p>
                        <Badge className={`gap-1 ${S.cls}`} variant="outline">
                          <Icon className="w-3 h-3" /> {S.label}
                        </Badge>
                        {r.preset_method && (
                          <Badge variant="outline" className="text-[10px]">Auto → {r.preset_method.toUpperCase()}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.recipient_name || "Anyone with the link"}
                        {r.recipient_note ? ` · "${r.recipient_note}"` : ""}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Created {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        {r.status === "claimed" && r.claimed_at
                          ? ` · Paid ${formatDistanceToNow(new Date(r.claimed_at), { addSuffix: true })} via ${r.claimed_method || "—"}`
                          : ` · Expires ${formatDistanceToNow(new Date(r.expires_at), { addSuffix: true })}`}
                      </p>
                      <code className="text-[11px] block break-all text-muted-foreground">{r.short_url}</code>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => copyLink(r.short_url)}>
                        <Copy className="w-3.5 h-3.5 mr-1" /> Copy
                      </Button>
                      {r.status === "claimed" && (
                        <Button asChild size="sm" variant="outline" onClick={async (e) => {
                          e.preventDefault();
                          const { data } = await supabase
                            .from("ledger_entries")
                            .select("journal_id")
                            .ilike("description", `Payment Link release [${r.short_code}]%`)
                            .limit(1)
                            .maybeSingle();
                          if ((data as any)?.journal_id) {
                            window.location.href = `/transactions/${(data as any).journal_id}`;
                          } else {
                            toast.error("Release entry not found");
                          }
                        }}>
                          <a><CheckCircle className="w-3.5 h-3.5 mr-1" /> View payment</a>
                        </Button>
                      )}
                      {r.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => setRevokeTarget(r)}>
                          <X className="w-3.5 h-3.5 mr-1" /> Revoke
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent></Card>
        )}

        <RevokePaymentLinkDialog
          open={!!revokeTarget}
          onOpenChange={(open) => { if (!open && !revokeBusy) setRevokeTarget(null); }}
          shortCode={revokeTarget?.short_code ?? ""}
          amount={Number(revokeTarget?.amount ?? 0)}
          currency={revokeTarget?.currency ?? "CAD"}
          recipientLabel={revokeTarget?.recipient_name}
          busy={revokeBusy}
          onConfirm={confirmRevoke}
        />

        <CreatePaymentLinkModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => qc.invalidateQueries({ queryKey: ["payment-link-payouts"] })}
        />
      </main>
  );
};

export default PaymentLinksPage;
