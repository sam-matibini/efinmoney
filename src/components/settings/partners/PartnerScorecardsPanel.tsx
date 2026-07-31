import { useEffect, useState } from "react";
import {
  usePartnerScorecards,
  usePartnerScoreWeights,
  useRunScorecardScan,
  useSavePartnerScoreWeights,
  type PartnerScorecard,
  type PartnerScoreWeights,
  type ScoreAction,
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
import { Gauge, RefreshCw, TrendingDown, TrendingUp, Minus, ChevronDown, ChevronRight } from "lucide-react";

const ACTION_COPY: Record<ScoreAction, string> = {
  warn: "Flag only — ranking untouched",
  deprioritise: "Push the partner below scoring rivals, keep as failover",
  block: "Drop the partner and fail over to the next candidate",
};

const gradeVariant = (grade: string): "default" | "secondary" | "destructive" | "outline" => {
  if (grade === "A" || grade === "B") return "default";
  if (grade === "C") return "secondary";
  if (grade === "N/A" || grade === "~") return "outline";
  return "destructive";
};

const fmt = (n: number | null | undefined, suffix = "") =>
  n == null ? "—" : `${Math.round(Number(n) * 100) / 100}${suffix}`;

const Trend = ({ card }: { card: PartnerScorecard }) => {
  if (card.previous_score == null) return <Minus className="h-4 w-4 text-muted-foreground" />;
  const delta = card.composite_score - card.previous_score;
  if (Math.abs(delta) < 0.5) return <Minus className="h-4 w-4 text-muted-foreground" />;
  return delta > 0
    ? <span className="inline-flex items-center gap-1 text-success"><TrendingUp className="h-4 w-4" />{fmt(delta)}</span>
    : <span className="inline-flex items-center gap-1 text-destructive"><TrendingDown className="h-4 w-4" />{fmt(delta)}</span>;
};

const DimensionBar = ({ label, value, weight }: { label: string; value: number; weight: number }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label} <span className="opacity-60">· weight {weight}</span></span>
      <span className="font-medium">{fmt(value)}</span>
    </div>
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className="h-1.5 rounded-full bg-primary"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  </div>
);

export const PartnerScorecardsPanel = () => {
  const { data: cards, isLoading } = usePartnerScorecards();
  const { data: settings } = usePartnerScoreWeights();
  const save = useSavePartnerScoreWeights();
  const scan = useRunScorecardScan();
  const [form, setForm] = useState<Partial<PartnerScoreWeights>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const set = (patch: Partial<PartnerScoreWeights>) => setForm((f) => ({ ...f, ...patch }));
  const numField = (key: keyof PartnerScoreWeights, label: string, step = "1") => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={step}
        value={String(form[key] ?? "")}
        onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<PartnerScoreWeights>)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" /> Performance scoring
            </CardTitle>
            <CardDescription>
              Realised success, speed, disputes, billed-cost variance and margin delivery, weighted into
              one score per partner corridor. Scores shade routing — margin guardrails always win.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
            Run scan now
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Apply scores to live routing</p>
              <p className="text-xs text-muted-foreground">
                Off by default — scorecards are computed either way, this only controls whether they move the ranking.
              </p>
            </div>
            <Switch checked={!!form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {numField("weight_success", "Success weight")}
            {numField("weight_speed", "Speed weight")}
            {numField("weight_dispute", "Dispute weight")}
            {numField("weight_cost_variance", "Cost variance weight")}
            {numField("weight_margin", "Margin weight")}
            {numField("weight_liquidity", "Liquidity weight")}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {numField("lookback_days", "Lookback (days)")}
            {numField("min_attempts", "Minimum attempts to trust a score")}
            {numField("min_score_to_route", "Minimum score to route")}
            {numField("max_score_influence", "Max ranking influence (0–1)", "0.01")}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Below-threshold action</Label>
              <Select
                value={form.below_threshold_action ?? "warn"}
                onValueChange={(v) => set({ below_threshold_action: v as ScoreAction })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_COPY) as ScoreAction[]).map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ACTION_COPY[(form.below_threshold_action ?? "warn") as ScoreAction]}
              </p>
            </div>
            <div className="flex items-end">
              <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                Save settings
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scorecards</CardTitle>
          <CardDescription>
            One row per partner and corridor over the last {form.lookback_days ?? 30} days. Expand a row for
            the per-dimension breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !cards?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No scorecards yet — run a scan once routing attempts exist.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Partner</TableHead>
                    <TableHead>Corridor</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead className="text-right">Trend</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead className="text-right">Success</TableHead>
                    <TableHead className="text-right">p95 mins</TableHead>
                    <TableHead className="text-right">Cost var</TableHead>
                    <TableHead className="text-right">Margin gap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((c) => (
                    <>
                      <TableRow
                        key={c.id}
                        className="cursor-pointer"
                        onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                      >
                        <TableCell>
                          {expanded === c.id
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="font-medium">{c.partner_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {c.corridor_label ?? c.corridor_key}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(c.composite_score)}</TableCell>
                        <TableCell>
                          <Badge variant={gradeVariant(c.grade)}>{c.grade}</Badge>
                          {!c.confident && (
                            <span className="ml-2 text-xs text-muted-foreground">low volume</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right"><Trend card={c} /></TableCell>
                        <TableCell className="text-right">{c.attempt_count}</TableCell>
                        <TableCell className="text-right">{fmt(c.success_rate, "%")}</TableCell>
                        <TableCell className="text-right">{fmt(c.p95_settlement_minutes)}</TableCell>
                        <TableCell className="text-right">{fmt(c.cost_variance_percent, "%")}</TableCell>
                        <TableCell className="text-right">{fmt(c.margin_gap_percent, "pp")}</TableCell>
                      </TableRow>
                      {expanded === c.id && (
                        <TableRow key={`${c.id}-detail`}>
                          <TableCell colSpan={11} className="bg-muted/40">
                            <div className="grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
                              <DimensionBar label="Success" value={c.score_success} weight={form.weight_success ?? 0} />
                              <DimensionBar label="Speed" value={c.score_speed} weight={form.weight_speed ?? 0} />
                              <DimensionBar label="Disputes" value={c.score_dispute} weight={form.weight_dispute ?? 0} />
                              <DimensionBar label="Cost variance" value={c.score_cost_variance} weight={form.weight_cost_variance ?? 0} />
                              <DimensionBar label="Margin delivery" value={c.score_margin} weight={form.weight_margin ?? 0} />
                              <DimensionBar label="Liquidity" value={c.score_liquidity} weight={form.weight_liquidity ?? 0} />
                            </div>
                            <div className="grid gap-2 border-t pt-3 text-xs text-muted-foreground sm:grid-cols-3">
                              <span>Realised margin {fmt(c.realised_margin_percent, "%")} vs modelled {fmt(c.modelled_margin_percent, "%")}</span>
                              <span>{c.dispute_count} dispute(s) · {fmt(c.dispute_rate, "%")}</span>
                              <span>{c.liquidity_incidents} liquidity incident(s) · avg {fmt(c.avg_settlement_minutes)} mins</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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

export default PartnerScorecardsPanel;
