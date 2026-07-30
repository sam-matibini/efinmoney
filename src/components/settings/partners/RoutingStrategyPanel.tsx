import { useEffect, useState } from "react";
import {
  useRoutingRules,
  useCreateRoutingRule,
  useUpdateRoutingRule,
  type RoutingRule,
} from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save, Sparkles, CheckCircle2 } from "lucide-react";

const WEIGHTS: { key: keyof RoutingRule; label: string; hint: string }[] = [
  { key: "weight_profit", label: "Profitability", hint: "Expected gross profit on the route" },
  { key: "weight_success", label: "Success rate", hint: "Historical completion rate" },
  { key: "weight_fx", label: "FX competitiveness", hint: "Spread against mid-market" },
  { key: "weight_speed", label: "Settlement speed", hint: "Time to recipient" },
  { key: "weight_risk", label: "Risk / operations", hint: "Compliance and reliability" },
];

export const RoutingStrategyPanel = () => {
  const { data: rules, isLoading } = useRoutingRules();
  const create = useCreateRoutingRule();
  const update = useUpdateRoutingRule();

  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<RoutingRule | null>(null);

  useEffect(() => {
    if (!rules?.length) return;
    const target = rules.find((r) => r.id === selectedId) || rules.find((r) => r.is_active) || rules[0];
    setSelectedId(target.id);
    setDraft(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, selectedId]);

  const set = (patch: Partial<RoutingRule>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const totalWeight = draft
    ? WEIGHTS.reduce((sum, w) => sum + Number(draft[w.key] as number), 0)
    : 0;

  if (isLoading || !draft) {
    return (
      <Card>
        <CardContent className="py-8">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const save = () => {
    const { id, ...patch } = draft;
    update.mutate({ id, patch });
  };

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> Routing Strategy
            </CardTitle>
            <CardDescription>
              How the engine ranks eligible partners. Changing strategy is a configuration change — no deployment needed.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {rules?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.is_active ? " · active" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                create.mutate({
                  name: `Strategy ${(rules?.length || 0) + 1}`,
                  strategy: "best_overall",
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> New
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Strategy name</Label>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label>Selection mode</Label>
            <Select value={draft.strategy} onValueChange={(v) => set({ strategy: v as RoutingRule["strategy"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="lowest_cost">A — Lowest total cost</SelectItem>
                <SelectItem value="highest_profit">B — Highest gross profit</SelectItem>
                <SelectItem value="highest_expected_profit">C — Highest expected profit</SelectItem>
                <SelectItem value="best_overall">D — Best overall (weighted score)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {draft.strategy === "best_overall" && (
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Score weighting</h4>
              <Badge variant={Math.round(totalWeight) === 100 ? "default" : "destructive"}>
                {Math.round(totalWeight)}% allocated
              </Badge>
            </div>
            {WEIGHTS.map((w) => (
              <div key={String(w.key)} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span>
                    {w.label} <span className="text-muted-foreground text-xs">· {w.hint}</span>
                  </span>
                  <span className="tabular-nums font-medium">{Number(draft[w.key])}%</span>
                </div>
                <Slider
                  value={[Number(draft[w.key])]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => set({ [w.key]: v } as Partial<RoutingRule>)}
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>Minimum success rate (%)</Label>
            <Input
              type="number"
              value={draft.min_success_rate}
              onChange={(e) => set({ min_success_rate: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Max failover retries</Label>
            <Input type="number" value={draft.max_retries} onChange={(e) => set({ max_retries: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Failure cost (% of amount)</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.failure_cost_percent}
              onChange={(e) => set({ failure_cost_percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Chargeback allowance (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.chargeback_cost_percent}
              onChange={(e) => set({ chargeback_cost_percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Fraud allowance (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.fraud_cost_percent}
              onChange={(e) => set({ fraud_cost_percent: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Compliance cost per txn</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.compliance_cost_fixed}
              onChange={(e) => set({ compliance_cost_fixed: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label>Infrastructure cost per txn</Label>
            <Input
              type="number"
              step="0.01"
              value={draft.infrastructure_cost_fixed}
              onChange={(e) => set({ infrastructure_cost_fixed: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={update.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save strategy
          </Button>
          {draft.is_active ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Active strategy
            </Badge>
          ) : (
            <Button variant="outline" onClick={() => update.mutate({ id: draft.id, patch: { is_active: true } })}>
              Make active
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default RoutingStrategyPanel;
