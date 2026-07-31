import { useMemo, useState } from "react";
import { useCreateManualProposal, usePricingRecommendations } from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp } from "lucide-react";

const money = (v: number) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (v: number) => `${Number(v || 0).toFixed(2)}%`;

export const PricingRecommendationsPanel = () => {
  const [days, setDays] = useState(30);
  const [target, setTarget] = useState("3");
  const targetMargin = Number(target) || 0;
  const { data, isLoading } = usePricingRecommendations(days, targetMargin);
  const createProposal = useCreateManualProposal();

  const totals = useMemo(() => {
    const rows = data ?? [];
    return {
      uplift: rows.reduce((s, r) => s + r.revenue_uplift, 0),
      below: rows.filter((r) => r.current_margin_percent < targetMargin).length,
      billed: rows.reduce((s, r) => s + r.billed_cost, 0),
    };
  }, [data, targetMargin]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Pricing recommendations
            </CardTitle>
            <CardDescription>
              Actual revenue vs the cost partners actually billed us. The recommended fee is the customer
              percentage needed to reach the target margin on the same volume.
            </CardDescription>
          </div>
          <div className="flex items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Window</Label>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Target margin %</Label>
              <Input
                className="w-28"
                type="number"
                step="0.1"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Corridors below target</p>
            <p className="text-lg font-semibold">{totals.below}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Revenue uplift to reach target</p>
            <p className="text-lg font-semibold">{money(totals.uplift)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Billed cost matched</p>
            <p className="text-lg font-semibold">{money(totals.billed)}</p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No transaction economics in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corridor</TableHead>
                  <TableHead className="text-right">Txns</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Modelled cost</TableHead>
                  <TableHead className="text-right">Billed cost</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Current fee %</TableHead>
                  <TableHead className="text-right">Recommended %</TableHead>
                  <TableHead className="text-right">Uplift</TableHead>
                  <TableHead className="text-right">Propose</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => {
                  const below = r.current_margin_percent < targetMargin;
                  return (
                    <TableRow key={r.group_key}>
                      <TableCell className="text-sm">{r.group_label}</TableCell>
                      <TableCell className="text-right">{r.txn_count}</TableCell>
                      <TableCell className="text-right font-mono">{money(r.volume)}</TableCell>
                      <TableCell className="text-right font-mono">{money(r.revenue)}</TableCell>
                      <TableCell className="text-right font-mono">{money(r.modelled_cost)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.billed_cost ? money(r.billed_cost) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={below ? "destructive" : "default"}>
                          {pct(r.current_margin_percent)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{pct(r.current_percentage_fee)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {pct(r.recommended_percentage_fee)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.revenue_uplift ? money(r.revenue_uplift) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={createProposal.isPending}
                          onClick={() => createProposal.mutate(r)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Proposal
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PricingRecommendationsPanel;
