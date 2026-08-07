import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import TopScrollSync from "@/components/admin-portal/TopScrollSync";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Calendar, Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, subDays, startOfDay, startOfWeek, startOfMonth } from "date-fns";

// ─── Data ────────────────────────────────────────────────────────────────────

function useRevenueData() {
  return useQuery({
    queryKey: ["admin-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id, fee_amount, source_amount, source_currency, target_currency, recipient_country, recipient_name, sender_id, status, created_at, completed_at, payout_method")
        .eq("status", "completed")
        .gt("fee_amount", 0)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const corridorLabel = (src: string, tgt: string) => `${src} → ${tgt}`;

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <p className="text-sm text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RevenuePage() {
  const { data: transfers = [], isLoading } = useRevenueData();

  const now = new Date();
  const todayStart    = startOfDay(now).toISOString();
  const weekStart     = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
  const monthStart    = startOfMonth(now).toISOString();

  const totalAllTime = useMemo(
    () => transfers.reduce((s, t) => s + Number(t.fee_amount), 0),
    [transfers],
  );
  const totalMonth = useMemo(
    () => transfers.filter((t) => t.created_at >= monthStart).reduce((s, t) => s + Number(t.fee_amount), 0),
    [transfers, monthStart],
  );
  const totalWeek = useMemo(
    () => transfers.filter((t) => t.created_at >= weekStart).reduce((s, t) => s + Number(t.fee_amount), 0),
    [transfers, weekStart],
  );
  const totalToday = useMemo(
    () => transfers.filter((t) => t.created_at >= todayStart).reduce((s, t) => s + Number(t.fee_amount), 0),
    [transfers, todayStart],
  );

  // Daily chart — last 30 days
  const chartData = useMemo(() => {
    const days: { date: string; fee: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const day = format(subDays(now, i), "MMM d");
      const dayStr = format(subDays(now, i), "yyyy-MM-dd");
      const fee = transfers
        .filter((t) => t.created_at.startsWith(dayStr))
        .reduce((s, t) => s + Number(t.fee_amount), 0);
      days.push({ date: day, fee: Number(fee.toFixed(2)) });
    }
    return days;
  }, [transfers]);

  // Revenue by corridor
  const byCorridor = useMemo(() => {
    const map = new Map<string, { count: number; total: number; currency: string }>();
    transfers.forEach((t) => {
      const key = corridorLabel(t.source_currency, t.target_currency);
      const existing = map.get(key) ?? { count: 0, total: 0, currency: t.source_currency };
      map.set(key, {
        count: existing.count + 1,
        total: existing.total + Number(t.fee_amount),
        currency: t.source_currency,
      });
    });
    return Array.from(map.entries())
      .map(([corridor, v]) => ({ corridor, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [transfers]);

  // Recent 50 fee transactions
  const recent = transfers.slice(0, 50);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-7 w-7 text-primary" />
            Revenue
          </h1>
          <p className="text-muted-foreground mt-1">
            Fee income from completed transfers — all figures in source currency
          </p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="All-time fees"
            value={fmt(totalAllTime)}
            sub={`${transfers.length} completed transfers`}
            icon={DollarSign}
          />
          <KpiCard
            label="This month"
            value={fmt(totalMonth)}
            sub={format(now, "MMMM yyyy")}
            icon={Calendar}
          />
          <KpiCard
            label="This week"
            value={fmt(totalWeek)}
            sub="Mon – Sun"
            icon={TrendingUp}
          />
          <KpiCard
            label="Today"
            value={fmt(totalToday)}
            sub={format(now, "EEEE, MMM d")}
            icon={Clock}
          />
        </div>

        {/* Daily chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Fee Revenue — Last 30 Days</CardTitle>
            <CardDescription>Sum of fee_amount on completed transfers per day</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.every((d) => d.fee === 0) ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                No fee revenue in the last 30 days yet
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    interval={4}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${v}`}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(v: number) => [`$${v.toFixed(2)}`, "Fees"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="fee" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* By corridor */}
        <Card>
          <CardHeader>
            <CardTitle>Revenue by Corridor</CardTitle>
            <CardDescription>Grouped by source → destination currency</CardDescription>
          </CardHeader>
          <CardContent>
            {byCorridor.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No completed transfers with fees yet</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Corridor</TableHead>
                      <TableHead className="text-right">Transfers</TableHead>
                      <TableHead className="text-right">Total fees</TableHead>
                      <TableHead className="text-right">Avg fee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCorridor.map((row) => (
                      <TableRow key={row.corridor}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {row.corridor}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmt(row.total, row.currency)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmt(row.total / row.count, row.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Fee Transactions</CardTitle>
            <CardDescription>Last 50 completed transfers with a non-zero fee</CardDescription>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No fee transactions yet</p>
            ) : (
              <TopScrollSync className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Corridor</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {format(new Date(t.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">{t.recipient_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">
                            {corridorLabel(t.source_currency, t.target_currency)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(t.source_amount, t.source_currency)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {fmt(t.fee_amount, t.source_currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TopScrollSync>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
