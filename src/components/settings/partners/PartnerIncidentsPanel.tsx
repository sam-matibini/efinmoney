import { useEffect, useState } from "react";
import {
  useIncidentAction,
  useIncidentSettings,
  usePartnerSuspensions,
  useRunIncidentScan,
  useSaveIncidentSettings,
  type IncidentSettings,
} from "@/hooks/usePartnerOps";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { ShieldAlert, RefreshCw, Play } from "lucide-react";

const DEFAULTS: Partial<IncidentSettings> = {
  enabled: false,
  auto_restore: true,
  cooldown_minutes: 60,
  lookback_minutes: 60,
  min_attempts: 10,
  max_failure_rate_percent: 35,
  critical_alert_count: 3,
  min_score_to_operate: 40,
  suspend_scope: "corridor",
  liquidity_warning_days: 3,
  forecast_history_days: 60,
};

const NumField = ({
  label, value, onChange, hint,
}: { label: string; value: number; onChange: (n: number) => void; hint?: string }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const SuspendDialog = () => {
  const { data: partners } = usePaymentPartners();
  const action = useIncidentAction();
  const [open, setOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [corridorKey, setCorridorKey] = useState("");
  const [reason, setReason] = useState("");

  const submit = () => {
    if (!partnerId || !reason.trim()) return;
    action.mutate(
      { action: "suspend", partner_id: partnerId, corridor_key: corridorKey.trim() || null, reason: reason.trim() },
      { onSuccess: () => { setOpen(false); setReason(""); setCorridorKey(""); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="destructive">Suspend partner</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Suspend a partner</DialogTitle>
          <DialogDescription>
            Suspended partners are excluded from routing before pricing, overrides and scores apply.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Partner</Label>
            <Select value={partnerId} onValueChange={setPartnerId}>
              <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
              <SelectContent>
                {(partners ?? []).map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name ?? p.code}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Corridor key (optional)</Label>
            <Input
              placeholder="CAD-NGN-NG-mobile_money — leave blank for all corridors"
              value={corridorKey}
              onChange={(e) => setCorridorKey(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this partner being suspended?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={action.isPending || !partnerId || !reason.trim()}>
            Suspend
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const PartnerIncidentsPanel = () => {
  const { data: settings, isLoading: settingsLoading } = useIncidentSettings();
  const save = useSaveIncidentSettings();
  const { data: suspensions, isLoading } = usePartnerSuspensions();
  const action = useIncidentAction();
  const scan = useRunIncidentScan();
  const [form, setForm] = useState<Partial<IncidentSettings>>(DEFAULTS);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const set = (patch: Partial<IncidentSettings>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Incident auto-suspension
            </CardTitle>
            <CardDescription>
              Automatically pull a partner out of routing when failures spike, critical alerts pile up,
              or its performance score collapses. Restores automatically after the cooldown when healthy.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
              <Play className={`mr-2 h-4 w-4 ${scan.isPending ? "animate-pulse" : ""}`} />
              Run scan
            </Button>
            <SuspendDialog />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {settingsLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.enabled} onCheckedChange={(v) => set({ enabled: v })} />
                  <Label>Auto-suspension enabled</Label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.auto_restore} onCheckedChange={(v) => set({ auto_restore: v })} />
                  <Label>Auto-restore after cooldown</Label>
                </div>
                <div className="w-48 space-y-1.5">
                  <Label>Suspend scope</Label>
                  <Select
                    value={form.suspend_scope ?? "corridor"}
                    onValueChange={(v) => set({ suspend_scope: v as IncidentSettings["suspend_scope"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corridor">Corridor only</SelectItem>
                      <SelectItem value="partner">Whole partner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <NumField label="Lookback (minutes)" value={form.lookback_minutes ?? 60} onChange={(n) => set({ lookback_minutes: n })} />
                <NumField label="Minimum attempts" value={form.min_attempts ?? 10} onChange={(n) => set({ min_attempts: n })} hint="Below this, no action" />
                <NumField label="Max failure rate %" value={form.max_failure_rate_percent ?? 35} onChange={(n) => set({ max_failure_rate_percent: n })} />
                <NumField label="Critical alerts to trip" value={form.critical_alert_count ?? 3} onChange={(n) => set({ critical_alert_count: n })} />
                <NumField label="Min score to operate" value={form.min_score_to_operate ?? 40} onChange={(n) => set({ min_score_to_operate: n })} />
                <NumField label="Cooldown (minutes)" value={form.cooldown_minutes ?? 60} onChange={(n) => set({ cooldown_minutes: n })} />
                <NumField label="Liquidity warning days" value={form.liquidity_warning_days ?? 3} onChange={(n) => set({ liquidity_warning_days: n })} />
                <NumField label="Forecast history (days)" value={form.forecast_history_days ?? 60} onChange={(n) => set({ forecast_history_days: n })} />
              </div>

              <div className="flex justify-end">
                <Button onClick={() => save.mutate(form)} disabled={save.isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${save.isPending ? "animate-spin" : ""}`} />
                  Save settings
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suspensions</CardTitle>
          <CardDescription>Active and historical partner suspensions with their trigger source.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !suspensions?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No suspensions recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Corridor</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Until</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suspensions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.partner_name}</TableCell>
                      <TableCell>{s.scope}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.corridor_key ?? "all"}</TableCell>
                      <TableCell className="max-w-[260px] truncate" title={s.reason}>{s.reason}</TableCell>
                      <TableCell><Badge variant="outline">{s.trigger_source}</Badge></TableCell>
                      <TableCell className="text-xs">{new Date(s.suspended_from).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {s.suspended_until ? new Date(s.suspended_until).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "destructive" : "secondary"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.status === "active" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => action.mutate({ action: "resume", suspension_id: s.id, reason: "Manual resume" })}
                            disabled={action.isPending}
                          >
                            Resume
                          </Button>
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

export default PartnerIncidentsPanel;
