import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, TrendingUp } from "lucide-react";

type GroupBy = "corridor" | "method" | "partner";

interface MarginRow {
  group_key: string;
  group_label: string;
  txn_count: number;
  volume: number;
  posted_revenue: number;
  modelled_revenue: number;
  modelled_cost: number;
  billed_cost: number;
  gross_margin: number;
  margin_percent: number;
  revenue_variance: number;
}

interface VarianceRow {
  transfer_id: string;
  created_at: string;
  corridor: string;
  payment_method: string | null;
  amount: number;
  expected_revenue: number;
  posted_revenue: number;
  variance: number;
  currency_code: string | null;
}

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];

const money = (n: number, ccy = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: ccy, maximumFractionDigits: 2 })
    .format(Number(n || 0));

const pct = (n: number) => `${Number(n || 0).toFixed(2)}%`;

export default function PricingMarginPanel() {
  const [days, setDays] = useState("30");
  const [groupBy, setGroupBy] = useState<GroupBy>("corridor");

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(days) * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [days]);

  const { data: margin, isLoading: marginLoading } = useQuery({
    queryKey: ["pricing-margin", range.from, range.to, groupBy],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pricing_margin_statement", {
        p_from: range.from, p_to: range.to, p_group_by: groupBy,
      });
      if (error) throw error;
      return (data ?? []) as MarginRow[];
    },
  });

  const { data: variances, isLoading: varLoading } = useQuery({
    queryKey: ["revenue-assurance", range.from, range.to],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("revenue_assurance_variance", {
        p_from: range.from, p_to: range.to, p_min_variance: 0.01, p_limit: 200,
      });
      if (error) throw error;
      return (data ?? []) as VarianceRow[];
    },
  });

  const totals = useMemo(() => {
    const rows = margin ?? [];
    const sum = (k: keyof MarginRow) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
    const revenue = sum("posted_revenue");
    const volume = sum("volume");
    return {
      volume,
      revenue,
      cost: sum("billed_cost") || sum("modelled_cost"),
      margin: sum("gross_margin"),
      marginPct: volume > 0 ? (sum("gross_margin") / volume) * 100 : 0,
      variance: sum("revenue_variance"),
      txns: sum("txn_count"),
    };
  }, [margin]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="corridor">By corridor</SelectItem>
            <SelectItem value="method">By payment method</SelectItem>
            <SelectItem value="partner">By partner</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Volume", value: money(totals.volume), sub: `${totals.txns} transactions` },
          { label: "Fee & FX revenue", value: money(totals.revenue), sub: "Posted to the ledger" },
          { label: "Partner cost", value: money(totals.cost), sub: "Billed, else modelled" },
          { label: "Gross margin", value: money(totals.margin), sub: pct(totals.marginPct) },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-2xl">{c.value}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">{c.sub}</CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="margin" className="space-y-4">
        <TabsList>
          <TabsTrigger value="margin">
            <TrendingUp className="h-4 w-4 mr-2" />Pricing &amp; margin
          </TabsTrigger>
          <TabsTrigger value="assurance">
            <AlertTriangle className="h-4 w-4 mr-2" />Revenue assurance
            {variances?.length ? (
              <Badge variant="secondary" className="ml-2">{variances.length}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="margin">
          <Card>
            <CardHeader>
              <CardTitle>Pricing &amp; margin statement</CardTitle>
              <CardDescription>
                Revenue booked in the ledger against modelled rate-card revenue and partner cost.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {marginLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : !margin?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No priced activity in this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{groupBy === "partner" ? "Partner" : groupBy === "method" ? "Method" : "Corridor"}</TableHead>
                      <TableHead className="text-right">Txns</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Posted revenue</TableHead>
                      <TableHead className="text-right">Rate-card revenue</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Gross margin</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {margin.map((r) => (
                      <TableRow key={r.group_key}>
                        <TableCell className="font-medium">{r.group_label || r.group_key}</TableCell>
                        <TableCell className="text-right">{r.txn_count}</TableCell>
                        <TableCell className="text-right">{money(r.volume)}</TableCell>
                        <TableCell className="text-right">{money(r.posted_revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {money(r.modelled_revenue)}
                        </TableCell>
                        <TableCell className="text-right">
                          {money(r.billed_cost || r.modelled_cost)}
                        </TableCell>
                        <TableCell className={`text-right ${Number(r.gross_margin) < 0 ? "text-destructive" : ""}`}>
                          {money(r.gross_margin)}
                        </TableCell>
                        <TableCell className="text-right">{pct(r.margin_percent)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assurance">
          <Card>
            <CardHeader>
              <CardTitle>Revenue assurance</CardTitle>
              <CardDescription>
                Transactions where the fee posted to the ledger differs from the rate-card price.
                Total variance {money(totals.variance)}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {varLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : !variances?.length ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No pricing variances — every fee matches the rate card.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Corridor</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Expected</TableHead>
                      <TableHead className="text-right">Posted</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variances.map((v) => (
                      <TableRow key={v.transfer_id}>
                        <TableCell>{new Date(v.created_at).toLocaleDateString()}</TableCell>
                        <TableCell>{v.corridor}</TableCell>
                        <TableCell className="text-muted-foreground">{v.payment_method ?? "—"}</TableCell>
                        <TableCell className="text-right">{money(v.amount, v.currency_code ?? "CAD")}</TableCell>
                        <TableCell className="text-right">{money(v.expected_revenue, v.currency_code ?? "CAD")}</TableCell>
                        <TableCell className="text-right">{money(v.posted_revenue, v.currency_code ?? "CAD")}</TableCell>
                        <TableCell className={`text-right font-medium ${Number(v.variance) < 0 ? "text-destructive" : "text-primary"}`}>
                          {money(v.variance, v.currency_code ?? "CAD")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
