import { useState } from "react";
import {
  useFeeAdjustmentSettings,
  usePricingProposals,
  useReviewPricingProposal,
  useRunFeeAdjustScan,
  useSaveFeeAdjustmentSettings,
  type FeeAdjustmentSettings,
  type PricingProposalStatus,
} from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, RefreshCw, Wand2, X } from "lucide-react";

const money = (v: number) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const pct = (v: number) => `${Number(v || 0).toFixed(3)}%`;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  applied: "default",
  rejected: "destructive",
  superseded: "outline",
  approved: "default",
};

export const FeeAdjustmentsPanel = () => {
  const { data: settings, isLoading: loadingSettings } = useFeeAdjustmentSettings();
  const [status, setStatus] = useState<PricingProposalStatus | "all">("pending");
  const { data: proposals, isLoading } = usePricingProposals(status);
  const save = useSaveFeeAdjustmentSettings();
  const scan = useRunFeeAdjustScan();
  const review = useReviewPricingProposal();

  const [draft, setDraft] = useState<Partial<FeeAdjustmentSettings> | null>(null);
  const current = { ...(settings ?? {}), ...(draft ?? {}) } as FeeAdjustmentSettings;
  const set = (patch: Partial<FeeAdjustmentSettings>) => setDraft({ ...(draft ?? {}), ...patch });

  const numberField = (
    key: keyof FeeAdjustmentSettings,
    label: string,
    step = "1",
    hint?: string,
  ) => (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={String(current[key] ?? "")}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<FeeAdjustmentSettings>)}
      />
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Automated fee adjustments
          </CardTitle>
          <CardDescription>
            Turns pricing recommendations into reviewable proposals. Use this for volume or discount overrides — approved proposals write a new versioned customer pricing row.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingSettings ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!current.enabled}
                    onCheckedChange={(v) => set({ enabled: v })}
                  />
                  <Label className="text-sm">Daily scan enabled</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!current.auto_apply}
                    onCheckedChange={(v) => set({ auto_apply: v })}
                  />
                  <Label className="text-sm">Auto-apply without review</Label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {numberField("target_margin_percent", "Target margin %", "0.1")}
                {numberField("lookback_days", "Lookback days")}
                {numberField("min_txn_count", "Min txns")}
                {numberField("min_volume", "Min volume", "100")}
                {numberField("max_fee_delta_percent", "Max fee move (pp)", "0.05", "Caps each change")}
                {numberField("cooldown_days", "Cooldown days")}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!draft || save.isPending}
                  onClick={() => save.mutate({ id: settings?.id, ...draft }, { onSuccess: () => setDraft(null) })}
                >
                  Save settings
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={scan.isPending}
                  onClick={() => scan.mutate()}
                >
                  <RefreshCw className={`mr-2 h-3.5 w-3.5 ${scan.isPending ? "animate-spin" : ""}`} />
                  Run scan now
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Fee proposals</CardTitle>
              <CardDescription>Approve to publish a new customer fee, or reject with a note.</CardDescription>
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as PricingProposalStatus | "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="superseded">Superseded</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !proposals?.length ? (
            <p className="text-sm text-muted-foreground">No proposals in this state.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Corridor</TableHead>
                    <TableHead className="text-right">Txns</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Fee now</TableHead>
                    <TableHead className="text-right">Proposed</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead className="text-right">Uplift</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {proposals.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{p.group_label}</TableCell>
                      <TableCell className="text-right">{p.txn_count}</TableCell>
                      <TableCell className="text-right font-mono">{money(p.volume)}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={p.current_margin_percent < p.target_margin_percent ? "destructive" : "default"}
                        >
                          {pct(p.current_margin_percent)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{pct(p.current_percentage_fee)}</TableCell>
                      <TableCell className="text-right font-mono">{pct(p.proposed_percentage_fee)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.fee_delta_percent > 0 ? "+" : ""}
                        {p.fee_delta_percent.toFixed(3)}pp
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {p.expected_revenue_uplift ? money(p.expected_revenue_uplift) : "—"}
                      </TableCell>
                      <TableCell className="text-xs capitalize">{p.source.replace("_", " ")}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {p.status === "pending" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={review.isPending}
                              onClick={() => review.mutate({ id: p.id, action: "approve" })}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={review.isPending}
                              onClick={() => review.mutate({ id: p.id, action: "reject" })}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
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

export default FeeAdjustmentsPanel;
