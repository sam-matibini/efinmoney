import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransfers } from "@/hooks/useTransfers";
import { ChevronRight, Inbox, Search, Download, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { downloadTransferReceipt } from "@/lib/receipt";
import { cleanIncomingTransactionLabel, INCOMING_REFERENCE_TYPES } from "@/lib/incomingTransactions";
import { currencySymbol } from "@/lib/currency";
import { format, isToday, isYesterday } from "date-fns";

const refOf = (id: string) => `EFM-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const statusBadge = (s: string) => {
  if (s === "completed") return "bg-green-500/20 text-green-500 border-green-500/40";
  if (["failed", "reversed", "expired"].includes(s)) return "bg-destructive/20 text-destructive border-destructive/40";
  if (["processing", "funded"].includes(s)) return "bg-yellow-500/20 text-yellow-500 border-yellow-500/40";
  return "bg-blue-500/20 text-blue-500 border-blue-500/40";
};

const groupFor = (s: string) => {
  if (s === "completed") return "completed";
  if (["failed", "reversed", "expired"].includes(s)) return "failed";
  return "processing";
};

const dateGroupLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
};

const fmt = (n: number) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Row = {
  id: string;
  direction: "out" | "in";
  recipientOrSource: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  transferId?: string;
  journalId?: string;
};

const TransfersListPage = () => {
  const { user } = useAuth();
  const { data: transfers, isLoading } = useTransfers(200);
  const [filter, setFilter] = useState<"all" | "processing" | "completed" | "failed">("all");
  const [direction, setDirection] = useState<"all" | "out" | "in">("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: incoming, isLoading: loadingIn } = useQuery({
    queryKey: ["incoming-ledger", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: wallets } = await supabase.from("wallets").select("id").eq("user_id", user!.id);
      const ids = (wallets ?? []).map((w) => w.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id, journal_id, created_at, credit_amount, currency_code, description, reference_type, reference_id")
        .in("wallet_id", ids)
        .in("reference_type", INCOMING_REFERENCE_TYPES)
        .gt("credit_amount", 0)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return [];
      const seen = new Set<string>();
      const out: any[] = [];
      for (const e of data ?? []) {
        if (seen.has(e.journal_id)) continue;
        seen.add(e.journal_id);
        out.push(e);
      }
      return out;
    },
  });

  const outgoingIds = useMemo(() => new Set((transfers ?? []).map((t) => t.id)), [transfers]);

  const rows: Row[] = useMemo(() => {
    const outRows: Row[] = (transfers ?? []).map((t) => ({
      id: `t-${t.id}`,
      direction: "out",
      recipientOrSource: t.recipient_name,
      amount: Number(t.source_amount),
      currency: t.source_currency,
      status: t.status,
      createdAt: t.created_at,
      transferId: t.id,
    }));
    const inRows: Row[] = (incoming ?? [])
      .filter((e: any) => !(e.reference_type === "transfer" && e.reference_id && outgoingIds.has(e.reference_id)))
      .map((e: any) => ({
        id: `l-${e.id}`,
        direction: "in",
        recipientOrSource: cleanIncomingTransactionLabel(e.description, e.reference_type),
        amount: Number(e.credit_amount),
        currency: e.currency_code,
        status: "completed",
        createdAt: e.created_at,
        journalId: e.journal_id,
      }));
    return [...outRows, ...inRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [transfers, incoming, outgoingIds]);

  const filtered = useMemo(() => {
    let items = rows;
    if (direction !== "all") items = items.filter((r) => r.direction === direction);
    if (filter !== "all") items = items.filter((r) => groupFor(r.status) === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (r) =>
          r.recipientOrSource.toLowerCase().includes(q) ||
          refOf(r.transferId || r.journalId || r.id).toLowerCase().includes(q)
      );
    }
    if (from) items = items.filter((r) => new Date(r.createdAt) >= new Date(from));
    if (to) items = items.filter((r) => new Date(r.createdAt) <= new Date(to + "T23:59:59"));
    return items;
  }, [rows, filter, direction, search, from, to]);

  const sumByCurrency = (items: Row[]) =>
    items.reduce<Record<string, number>>((acc, r) => {
      const c = (r.currency || "USD").toUpperCase();
      acc[c] = (acc[c] || 0) + r.amount;
      return acc;
    }, {});
  const totalsIn = sumByCurrency(filtered.filter((r) => r.direction === "in" && r.status === "completed"));
  const totalsOut = sumByCurrency(filtered.filter((r) => r.direction === "out" && r.status === "completed"));
  const renderTotals = (totals: Record<string, number>, sign: "+" | "-") => {
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return `${sign}${fmt(0)}`;
    return entries.map(([c, v]) => `${sign}${currencySymbol(c)}${fmt(v)}`).join("  ");
  };

  // Group by date
  const groups = useMemo(() => {
    return filtered.reduce<Record<string, Row[]>>((acc, r) => {
      const k = dateGroupLabel(r.createdAt);
      (acc[k] ||= []).push(r);
      return acc;
    }, {});
  }, [filtered]);

  const loading = isLoading || loadingIn;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6 max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold">Account Statement</h1>
          <p className="text-sm text-muted-foreground">Bank-style view of all money in and money out across your wallets.</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-emerald-500/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money In</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-emerald-600 dark:text-emerald-400 tabular-nums break-words leading-tight">{renderTotals(totalsIn, "+")}</div>
          </div>
          <div className="rounded-xl border border-border bg-rose-500/[0.04] p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Total Money Out</div>
            <div className="text-xl sm:text-2xl font-display font-bold text-rose-600 dark:text-rose-400 tabular-nums break-words leading-tight">{renderTotals(totalsOut, "-")}</div>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <Tabs value={direction} onValueChange={(v) => setDirection(v as any)}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="in">Received (In)</TabsTrigger>
                <TabsTrigger value="out">Sent (Out)</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="all">All status</TabsTrigger>
                <TabsTrigger value="processing">Processing</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="failed">Failed</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search recipient or reference" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <Inbox className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No transactions match your filters.</p>
              </div>
            ) : (
              <>
                {/* Statement header (desktop) */}
                <div className="hidden sm:grid grid-cols-[1fr_140px_140px_110px_50px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold border-b border-border">
                  <div>Description</div>
                  <div className="text-right">Money Out</div>
                  <div className="text-right">Money In</div>
                  <div className="text-right">Status</div>
                  <div></div>
                </div>

                <div className="space-y-4 mt-1">
                  {Object.entries(groups).map(([label, rs]) => (
                    <div key={label}>
                      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/30 rounded-md">{label}</div>
                      <div className="divide-y divide-border/60">
                        {rs.map((r, i) => {
                          const isIn = r.direction === "in";
                          const isFailed = ["failed", "reversed", "expired"].includes(r.status);
                          const linkTo = r.transferId ? `/transfers/${r.transferId}` : `/transactions/${r.journalId}`;
                          const amountColor = isFailed
                            ? "text-muted-foreground line-through decoration-rose-500/60"
                            : isIn ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
                          return (
                            <motion.div key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}>
                              <Link to={linkTo} className="grid sm:grid-cols-[1fr_140px_140px_110px_50px] grid-cols-[1fr_auto] gap-2 items-center px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors">
                                {/* Description */}
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${isIn ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}`}>
                                    {isIn ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-foreground truncate text-sm">{r.recipientOrSource}</p>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                      {refOf(r.transferId || r.journalId || r.id)} · {format(new Date(r.createdAt), "h:mm a")}
                                    </p>
                                  </div>
                                </div>

                                {/* Mobile: single amount */}
                                <div className="sm:hidden text-right">
                                  <p className={`text-sm font-display font-bold tabular-nums ${amountColor}`}>
                                    {isIn ? "+" : "-"}{fmt(r.amount)} {r.currency}
                                  </p>
                                  <Badge variant="outline" className={`text-[9px] mt-0.5 ${statusBadge(r.status)}`}>{r.status}</Badge>
                                </div>

                                {/* Desktop debit/credit columns */}
                                <div className="hidden sm:block text-right tabular-nums text-sm font-semibold">
                                  {!isIn ? <span className={amountColor}>-{fmt(r.amount)} {r.currency}</span> : <span className="text-muted-foreground/40">—</span>}
                                </div>
                                <div className="hidden sm:block text-right tabular-nums text-sm font-semibold">
                                  {isIn ? <span className={amountColor}>+{fmt(r.amount)} {r.currency}</span> : <span className="text-muted-foreground/40">—</span>}
                                </div>
                                <div className="hidden sm:flex justify-end">
                                  <Badge variant="outline" className={`text-[10px] ${statusBadge(r.status)}`}>{r.status}</Badge>
                                </div>
                                <div className="hidden sm:flex items-center justify-end gap-1">
                                  {r.transferId && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); downloadTransferReceipt(r.transferId!); }}
                                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                                      title="Download receipt"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                </div>
                              </Link>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <MobileNav />
    </div>
  );
};

export default TransfersListPage;
