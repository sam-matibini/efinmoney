import { useMemo, useState } from "react";
import { useCorridorForecasts, useRunForecastScan, type CorridorForecast } from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";

const HORIZONS = [7, 30, 90];

const money = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const confidenceVariant = (c: string): "default" | "secondary" | "outline" =>
  c === "high" ? "default" : c === "base" ? "secondary" : "outline";

const TrendCell = ({ pct }: { pct: number }) => {
  if (Math.abs(pct) < 1) {
    return <span className="inline-flex items-center gap-1 text-muted-foreground"><Minus className="h-3.5 w-3.5" />flat</span>;
  }
  return pct > 0
    ? <span className="inline-flex items-center gap-1 text-success"><TrendingUp className="h-3.5 w-3.5" />{pct.toFixed(1)}%</span>
    : <span className="inline-flex items-center gap-1 text-destructive"><TrendingDown className="h-3.5 w-3.5" />{pct.toFixed(1)}%</span>;
};

const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="rounded-lg border p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-xl font-semibold">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export const CorridorForecastPanel = () => {
  const [horizon, setHorizon] = useState(30);
  const { data: rows, isLoading } = useCorridorForecasts(horizon);
  const scan = useRunForecastScan();

  const totals = useMemo(() => {
    const list: CorridorForecast[] = rows ?? [];
    const volume = list.reduce((s, r) => s + r.forecast_volume, 0);
    const revenue = list.reduce((s, r) => s + r.forecast_revenue, 0);
    const cost = list.reduce((s, r) => s + r.forecast_cost, 0);
    const profit = revenue - cost;
    return {
      volume,
      revenue,
      cost,
      profit,
      margin: volume > 0 ? (profit / volume) * 100 : 0,
      corridors: list.length,
    };
  }, [rows]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" /> Corridor forecast
            </CardTitle>
            <CardDescription>
              Projected volume, revenue and margin per corridor, from realised transaction economics
              with a damped trend. Unit economics are carried forward from actuals.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v))}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HORIZONS.map((h) => <SelectItem key={h} value={String(h)}>{h} days</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
              Refresh forecast
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Corridors" value={String(totals.corridors)} />
            <Stat label={`Volume (${horizon}d)`} value={money(totals.volume)} />
            <Stat label="Revenue" value={money(totals.revenue)} />
            <Stat label="Cost" value={money(totals.cost)} />
            <Stat label="Gross profit" value={money(totals.profit)} hint={`${totals.margin.toFixed(2)}% margin`} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By corridor</CardTitle>
          <CardDescription>Ranked by projected volume over the next {horizon} days.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No forecast yet — run a refresh once transaction economics exist.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corridor</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Range</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                    <TableHead>Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.corridor_label ?? r.corridor_key}</TableCell>
                      <TableCell className="text-right">{Math.round(r.forecast_txn_count)}</TableCell>
                      <TableCell className="text-right">{money(r.forecast_volume)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {money(r.forecast_volume_low)} – {money(r.forecast_volume_high)}
                      </TableCell>
                      <TableCell className="text-right">{money(r.forecast_revenue)}</TableCell>
                      <TableCell className="text-right">{money(r.forecast_cost)}</TableCell>
                      <TableCell className={`text-right font-medium ${r.forecast_margin_percent < 0 ? "text-destructive" : ""}`}>
                        {r.forecast_margin_percent.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right"><TrendCell pct={r.trend_percent} /></TableCell>
                      <TableCell><Badge variant={confidenceVariant(r.confidence)}>{r.confidence}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CorridorForecastPanel;
