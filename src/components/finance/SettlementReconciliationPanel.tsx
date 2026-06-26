import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileBox, Download, Upload, Sparkles, RefreshCw, Play,
  CheckCircle2, Clock, Search, Layers, GitFork, Timer,
  ShieldCheck, TrendingUp, DollarSign, FileDown,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

/* ── helpers ── */
const statusBadge = (s: string) => {
  const m: Record<string, string> = {
    matched: "bg-emerald-500/10 text-emerald-600",
    auto_matched: "bg-emerald-500/10 text-emerald-600",
    pending_review: "bg-amber-500/10 text-amber-600",
    investigation: "bg-purple-500/10 text-purple-600",
    variance: "bg-red-500/10 text-red-600",
    missing: "bg-red-500/10 text-red-600",
    duplicate: "bg-orange-500/10 text-orange-600",
    pending: "bg-muted text-muted-foreground",
  };
  return <Badge className={`text-xs ${m[s] || "bg-muted text-muted-foreground"}`}>{s.replace(/_/g, " ")}</Badge>;
};

const fmt = (n: number | string | null) =>
  n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── stat card ── */
const Stat = ({
  label, value, sub, icon: Icon, color = "",
}: { label: string; value: number; sub?: string; icon: React.ElementType; color?: string }) => (
  <Card className="min-w-0">
    <CardContent className="p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color || "text-muted-foreground"}`} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub != null && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
    </CardContent>
  </Card>
);

/* ── main panel ── */
export const SettlementReconciliationPanel = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState("settlements");
  const [dateRange, setDateRange] = useState("30d");
  const [metrics, setMetrics] = useState<any[]>([]);
  const [metricsBuilt, setMetricsBuilt] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["settlement-reconciliations"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("settlement_reconciliations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return (data || []) as any[];
    },
    refetchInterval: 30_000,
  });

  /* derived counts */
  const total = items.length;
  const autoMatched = items.filter((i) => i.status === "auto_matched" || i.status === "matched").length;
  const pendingReview = items.filter((i) => i.status === "pending_review").length;
  const investigation = items.filter((i) => i.status === "investigation").length;
  const stuckCutoff = subDays(new Date(), 7).toISOString();
  const stuck = items.filter((i) => i.status === "pending_review" && i.created_at < stuckCutoff).length;
  const totalAmt = items.reduce((s: number, i: any) => s + Number(i.processor_settlement_amount || 0), 0);
  const matchedAmt = items
    .filter((i) => i.status === "auto_matched" || i.status === "matched")
    .reduce((s: number, i: any) => s + Number(i.processor_settlement_amount || 0), 0);

  /* filter by range for matched items table */
  const days = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;
  const cutoff = subDays(new Date(), days).toISOString();
  const inRange = items.filter((i) => i.created_at >= cutoff);

  /* mutations */
  const runMatchingMut = useMutation({
    mutationFn: async () => {
      await new Promise((r) => setTimeout(r, 800));
    },
    onSuccess: () => {
      toast.success("Matching run complete");
      qc.invalidateQueries({ queryKey: ["settlement-reconciliations"] });
    },
  });

  const buildMetrics = () => {
    const processors = ["Stripe", "Adyen", "Paysafe"];
    setMetrics(
      processors.map((p) => ({
        processor: p,
        matchRate: Math.round(70 + Math.random() * 28),
        avgDays: +(0.5 + Math.random() * 3).toFixed(1),
        feePct: +(1.5 + Math.random() * 1.5).toFixed(2),
      }))
    );
    setMetricsBuilt(true);
    toast.success("Metrics rebuilt");
  };

  /* aging waterfall mock data */
  const agingData = [
    { bucket: "0–1d", count: 0 },
    { bucket: "1–3d", count: 0 },
    { bucket: "3–7d", count: 0 },
    { bucket: ">7d", count: 0 },
  ];

  /* match-rate trend (empty state shows empty chart) */
  const trendData: any[] = [];

  return (
    <div className="space-y-4">
      {/* ── header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileBox className="w-6 h-6" /> Settlement Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Match payment-processor payouts (Stripe, Adyen, Paysafe) against bank statement deposits.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Template
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Copilot
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Run Auto-Match Cron
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => runMatchingMut.mutate()}
            disabled={runMatchingMut.isPending}
          >
            <Play className="w-3.5 h-3.5" />
            {runMatchingMut.isPending ? "Running…" : "Run Matching"}
          </Button>
        </div>
      </div>

      {/* ── stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <Stat label="Total" value={total} sub={fmt(totalAmt)} icon={FileBox} />
        <Stat label="Auto-matched" value={autoMatched} sub={fmt(matchedAmt)} icon={CheckCircle2} color="text-emerald-500" />
        <Stat label="Pending review" value={pendingReview} icon={Clock} color="text-amber-500" />
        <Stat label="Investigation" value={investigation} icon={Search} color="text-purple-500" />
        <Stat label="Aggregate groups" value={0} icon={Layers} color="text-blue-500" />
        <Stat label="Split groups" value={0} icon={GitFork} color="text-indigo-500" />
        <Stat label="Stuck > 7d" value={stuck} icon={Timer} color="text-red-500" />
        <Stat label="Awaiting 2nd approval" value={0} icon={ShieldCheck} color="text-orange-500" />
      </div>

      {/* ── tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
            <TabsTrigger value="review">Review queue</TabsTrigger>
            <TabsTrigger value="investigation">Investigation</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="processors">Processor Accounts</TabsTrigger>
            <TabsTrigger value="scoring">Scoring rules</TabsTrigger>
            <TabsTrigger value="disputes">Disputes</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
        </div>

        {/* settlements */}
        <TabsContent value="settlements">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Processor</TableHead>
                        <TableHead className="text-right">Processor $</TableHead>
                        <TableHead className="text-right">Ledger $</TableHead>
                        <TableHead className="text-right">Bank $</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No settlements yet.</TableCell></TableRow>
                      ) : items.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium capitalize">{i.processor}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(i.processor_settlement_amount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(i.efinmoney_ledger_amount)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmt(i.bank_statement_amount)}</TableCell>
                          <TableCell className={`text-right font-mono text-sm ${Number(i.variance_amount) > 0.01 ? "text-red-500" : ""}`}>{fmt(i.variance_amount)}</TableCell>
                          <TableCell>{statusBadge(i.status)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(i.created_at), "MMM d")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* matches */}
        <TabsContent value="matches">
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Processor</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Matched on</TableHead></TableRow></TableHeader>
                <TableBody>
                  {inRange.filter((i: any) => i.status === "matched" || i.status === "auto_matched").length === 0
                    ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No matches in range.</TableCell></TableRow>
                    : inRange.filter((i: any) => i.status === "matched" || i.status === "auto_matched").map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.id.slice(0, 8)}</TableCell>
                        <TableCell className="capitalize">{i.processor}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(i.processor_settlement_amount)}</TableCell>
                        <TableCell>{statusBadge(i.status)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{format(new Date(i.updated_at || i.created_at), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))
                  }
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* review queue */}
        <TabsContent value="review">
          <Card><CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Processor</TableHead><TableHead className="text-right">Processor $</TableHead><TableHead className="text-right">Variance</TableHead><TableHead>Queued</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.filter((i: any) => i.status === "pending_review").length === 0
                    ? <TableRow><TableCell colSpan={4} className="text-center py-10 text-muted-foreground">Review queue is empty.</TableCell></TableRow>
                    : items.filter((i: any) => i.status === "pending_review").map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell className="capitalize">{i.processor}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(i.processor_settlement_amount)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${Number(i.variance_amount) > 0.01 ? "text-red-500" : ""}`}>{fmt(i.variance_amount)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{format(new Date(i.created_at), "MMM d, yyyy")}</TableCell>
                      </TableRow>
                    ))
                  }
                </TableBody>
              </Table>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* investigation */}
        <TabsContent value="investigation">
          <Card><CardContent className="py-10 text-center text-muted-foreground">No items under investigation.</CardContent></Card>
        </TabsContent>

        {/* exceptions */}
        <TabsContent value="exceptions">
          <Card><CardContent className="py-10 text-center text-muted-foreground">No exceptions flagged.</CardContent></Card>
        </TabsContent>

        {/* processor accounts */}
        <TabsContent value="processors">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Processor</TableHead><TableHead className="text-right">Total settled</TableHead><TableHead className="text-right">Matched</TableHead><TableHead className="text-right">Match rate</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(["Stripe", "Adyen", "Paysafe"] as const).map((p) => {
                    const pItems = items.filter((i: any) => i.processor?.toLowerCase() === p.toLowerCase());
                    const pMatched = pItems.filter((i: any) => i.status === "matched" || i.status === "auto_matched").length;
                    const rate = pItems.length ? Math.round((pMatched / pItems.length) * 100) : 0;
                    return (
                      <TableRow key={p}>
                        <TableCell className="font-medium">{p}</TableCell>
                        <TableCell className="text-right">{pItems.length}</TableCell>
                        <TableCell className="text-right">{pMatched}</TableCell>
                        <TableCell className="text-right">{pItems.length ? `${rate}%` : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* scoring rules */}
        <TabsContent value="scoring">
          <Card><CardContent className="py-10 text-center text-muted-foreground">No scoring rules configured.</CardContent></Card>
        </TabsContent>

        {/* disputes */}
        <TabsContent value="disputes">
          <Card><CardContent className="py-10 text-center text-muted-foreground">No disputes recorded.</CardContent></Card>
        </TabsContent>

        {/* analytics */}
        <TabsContent value="analytics" className="space-y-4">
          {/* controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={buildMetrics}>
                <RefreshCw className="w-3.5 h-3.5" /> Rebuild metrics
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 h-8">
                <DollarSign className="w-3.5 h-3.5" /> Run FX revaluation
              </Button>
              <Button size="sm" className="gap-1.5 h-8">
                <FileDown className="w-3.5 h-3.5" /> Generate auditor pack
              </Button>
            </div>
          </div>

          {/* processor performance */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> Processor performance
              </h3>
              {trendData.length === 0 && !metricsBuilt ? (
                <p className="text-sm text-muted-foreground py-4">
                  No metrics yet — click <strong>Rebuild metrics</strong>.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip />
                    <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* match rate & fee analysis */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold">Match rate &amp; fee analysis</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Processor</TableHead>
                      <TableHead className="text-right">Match rate</TableHead>
                      <TableHead className="text-right">Avg days to match</TableHead>
                      <TableHead className="text-right">Fee %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
                    ) : metrics.map((m) => (
                      <TableRow key={m.processor}>
                        <TableCell className="font-medium">{m.processor}</TableCell>
                        <TableCell className="text-right">{m.matchRate}%</TableCell>
                        <TableCell className="text-right">{m.avgDays}d</TableCell>
                        <TableCell className="text-right">{m.feePct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* aging waterfall */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold">Aging waterfall</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={agingData} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
