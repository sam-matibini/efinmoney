import { useState } from "react";
import {
  useProfitabilitySummary,
  useRoutingVariance,
  usePricingGaps,
  type ProfitGroupBy,
} from "@/hooks/useProfitability";
import { useCostAssurance } from "@/hooks/useCostAssurance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingUp } from "lucide-react";


const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PERIODS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

export const ProfitabilityPanel = () => {
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<ProfitGroupBy>("partner");

  const { data: rows, isLoading, error } = useProfitabilitySummary(days, groupBy);
  const { data: variance } = useRoutingVariance(days);
  const { data: gaps } = usePricingGaps(days);
  const { data: billedRows } = useCostAssurance(days);

  // Actual billed partner cost is only attributable per partner, so we surface it in that grouping.
  const showBilled = groupBy === "partner";
  const billedByPartner = new Map<string, number>();
  (billedRows ?? []).forEach((b) => {
    billedByPartner.set(b.partner_name, (billedByPartner.get(b.partner_name) ?? 0) + b.billed_total);
    if (b.partner_code) {
      billedByPartner.set(b.partner_code, (billedByPartner.get(b.partner_code) ?? 0) + b.billed_total);
    }
  });
  const billedFor = (label: string) => (showBilled ? billedByPartner.get(label) : undefined);

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      count: acc.count + r.txn_count,
      volume: acc.volume + r.volume,
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost,
      profit: acc.profit + r.profit,
    }),
    { count: 0, volume: 0, revenue: 0, cost: 0, profit: 0 },
  );
  const blended = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;


  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.value} value={String(p.value)}>{p.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={groupBy} onValueChange={(v) => setGroupBy(v as ProfitGroupBy)}>
          <TabsList>
            <TabsTrigger value="partner">By partner</TabsTrigger>
            <TabsTrigger value="corridor">By corridor</TabsTrigger>
            <TabsTrigger value="currency">By currency</TabsTrigger>
            <TabsTrigger value="method">By method</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Transactions", totals.count.toLocaleString()],
          ["Volume", money(totals.volume)],
          ["Revenue", money(totals.revenue)],
          ["Cost", money(totals.cost)],
          ["Gross profit", money(totals.profit)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Profitability
            <Badge variant={blended >= 0 ? "default" : "destructive"}>
              {blended.toFixed(2)}% blended margin
            </Badge>
          </CardTitle>
          <CardDescription>Realised unit economics from completed payouts.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : !rows?.length ? (
            <p className="text-sm text-muted-foreground">
              No economics recorded in this period yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Modelled cost</TableHead>
                  {showBilled && <TableHead className="text-right">Billed cost</TableHead>}
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  {showBilled && <TableHead className="text-right">Billed margin</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const billed = billedFor(r.group_label);
                  const billedProfit = billed === undefined ? null : r.revenue - billed;
                  const billedMargin =
                    billedProfit === null || r.revenue <= 0 ? null : (billedProfit / r.revenue) * 100;
                  return (
                  <TableRow key={r.group_key}>
                    <TableCell className="font-medium">
                      {r.group_label}
                      {r.pricing_gaps > 0 && (
                        <Badge variant="destructive" className="ml-2">
                          {r.pricing_gaps} unpriced
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{r.txn_count}</TableCell>
                    <TableCell className="text-right">{money(r.volume)}</TableCell>
                    <TableCell className="text-right">{money(r.revenue)}</TableCell>
                    <TableCell className="text-right">{money(r.cost)}</TableCell>
                    {showBilled && (
                      <TableCell className="text-right text-muted-foreground">
                        {billed === undefined ? "—" : money(billed)}
                      </TableCell>
                    )}
                    <TableCell className="text-right">{money(r.profit)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={r.margin_percent >= 0 ? "secondary" : "destructive"}>
                        {r.margin_percent.toFixed(1)}%
                      </Badge>
                    </TableCell>
                    {showBilled && (
                      <TableCell className="text-right">
                        {billedMargin === null ? (
                          "—"
                        ) : (
                          <Badge variant={billedMargin >= 0 ? "secondary" : "destructive"}>
                            {billedMargin.toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })}

              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Forecast vs actual</CardTitle>
          <CardDescription>
            Where the engine's expected profit drifted from what was realised.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!variance?.length ? (
            <p className="text-sm text-muted-foreground">No routed decisions with economics yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Expected → actual partner</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variance.map((v) => (
                  <TableRow key={v.transfer_id}>
                    <TableCell>{new Date(v.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{v.corridor}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {v.expected_partner ?? "—"} → {v.actual_partner ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">{money(v.expected_profit)}</TableCell>
                    <TableCell className="text-right">{money(v.actual_profit)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={v.variance >= 0 ? "secondary" : "destructive"}>
                        {v.variance >= 0 ? "+" : ""}{money(v.variance)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Pricing gaps
          </CardTitle>
          <CardDescription>
            Corridors that moved money with no partner pricing on file — their cost is understated.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!gaps?.length ? (
            <p className="text-sm text-muted-foreground">Every transacting corridor is priced.</p>
          ) : (
            <div className="space-y-2">
              {gaps.map((g, i) => (
                <div
                  key={`${g.partner_code}-${g.source_currency}-${g.dest_currency}-${i}`}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{g.partner_name}</span>{" "}
                    <span className="text-muted-foreground">
                      {g.source_currency} → {g.dest_currency}
                      {g.dest_country ? ` · ${g.dest_country}` : ""}
                      {g.payment_method ? ` · ${g.payment_method}` : ""}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {g.txn_count} txn · {money(g.volume)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfitabilityPanel;
