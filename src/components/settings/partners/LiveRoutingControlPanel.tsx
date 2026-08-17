import { useMemo, useState } from "react";
import {
  useActiveRoutingRule,
  useSetExecutionMode,
  useLiveCorridors,
  useSetCorridorLive,
  useRoutingOverrides,
  useCreateRoutingOverride,
  useDeleteRoutingOverride,
} from "@/hooks/useRoutingEngine";
import { usePaymentPartners, isPartnerActive } from "@/hooks/usePartnerNetwork";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Pin, Ban, Trash2, Radio } from "lucide-react";

export const LiveRoutingControlPanel = () => {
  const { data: rule, isLoading } = useActiveRoutingRule();
  const setMode = useSetExecutionMode();
  const { data: corridors } = useLiveCorridors();
  const setLive = useSetCorridorLive();
  const { data: partners } = usePaymentPartners();
  const { data: overrides } = useRoutingOverrides();
  const createOverride = useCreateRoutingOverride();
  const deleteOverride = useDeleteRoutingOverride();

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState({
    override_type: "pin" as "pin" | "block",
    partner_id: "",
    source_currency: "CAD",
    dest_currency: "",
    dest_country: "",
    payment_method: "",
    reason: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (corridors ?? []) as any[];
    if (!q) return rows;
    return rows.filter((c) =>
      [c.dest_country, c.dest_currency, c.payment_method, c.payment_partners?.name, c.payment_partners?.code]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [corridors, search]);

  const liveCount = ((corridors ?? []) as any[]).filter((c) => c.live_routing_enabled).length;
  const partnerName = (id: string) => (partners ?? []).find((p: any) => p.id === id)?.name ?? id;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8"><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" /> Execution mode
          </CardTitle>
          <CardDescription>
            In shadow mode the engine only records what it would have chosen. Switch with Live to select and execute the rail for corridors enabled below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <Badge variant={rule?.execution_mode === "live" ? "default" : "secondary"}>
              {rule?.execution_mode === "live" ? "LIVE" : "SHADOW"}
            </Badge>
            <div className="flex items-center gap-2">
              <Switch
                checked={rule?.execution_mode === "live"}
                disabled={!rule || rule.kill_switch}
                onCheckedChange={(v) =>
                  rule && setMode.mutate({ id: rule.id, patch: { execution_mode: v ? "live" : "shadow" } })
                }
              />
              <span className="text-sm text-muted-foreground">Switch with Live</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {liveCount} corridor{liveCount === 1 ? "" : "s"} enabled
            </span>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium">Kill switch</p>
              <p className="text-xs text-muted-foreground">
                Immediately returns every transfer to the existing hardcoded rails.
              </p>
            </div>
            <Switch
              checked={!!rule?.kill_switch}
              onCheckedChange={(v) => rule && setMode.mutate({ id: rule.id, patch: { kill_switch: v } })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Live corridors</CardTitle>
          <CardDescription>Switch the engine on one corridor at a time.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search corridor, currency or partner"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            {filtered.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between border-b px-3 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.source_currency} → {c.dest_currency} · {c.dest_country}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.payment_partners?.name ?? "—"} · {c.payment_method} · ~{c.est_minutes ?? "?"} min
                  </p>
                </div>
                <Switch
                  checked={!!c.live_routing_enabled}
                  onCheckedChange={(v) => setLive.mutate({ id: c.id, live: v })}
                />
              </div>
            ))}
            {!filtered.length && (
              <p className="p-4 text-sm text-muted-foreground">No corridors match.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Operator overrides</CardTitle>
          <CardDescription>
            Pin a corridor to a partner or block a partner. Overrides beat the engine score.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={draft.override_type}
                onValueChange={(v: "pin" | "block") => setDraft({ ...draft, override_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pin">Pin to partner</SelectItem>
                  <SelectItem value="block">Block partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Partner</Label>
              <Select value={draft.partner_id} onValueChange={(v) => setDraft({ ...draft, partner_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
                <SelectContent>
                  {(partners ?? []).filter(isPartnerActive).map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Source currency</Label>
              <Input
                value={draft.source_currency}
                onChange={(e) => setDraft({ ...draft, source_currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1">
              <Label>Destination currency</Label>
              <Input
                value={draft.dest_currency}
                placeholder="NGN"
                onChange={(e) => setDraft({ ...draft, dest_currency: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1">
              <Label>Destination country</Label>
              <Input
                value={draft.dest_country}
                placeholder="NG (optional)"
                onChange={(e) => setDraft({ ...draft, dest_country: e.target.value.toUpperCase() })}
              />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input
                value={draft.reason}
                placeholder="Why this override"
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </div>
          </div>
          <Button
            disabled={!draft.partner_id || !draft.dest_currency || createOverride.isPending}
            onClick={() =>
              createOverride.mutate(
                {
                  override_type: draft.override_type,
                  partner_id: draft.partner_id,
                  direction: "payout",
                  source_currency: draft.source_currency || null,
                  dest_currency: draft.dest_currency || null,
                  dest_country: draft.dest_country || null,
                  payment_method: draft.payment_method || null,
                  reason: draft.reason || null,
                } as any,
                { onSuccess: () => setDraft({ ...draft, partner_id: "", reason: "" }) },
              )
            }
          >
            Add override
          </Button>

          <div className="space-y-2">
            {(overrides ?? []).map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  {o.override_type === "pin" ? (
                    <Pin className="h-4 w-4 text-primary" />
                  ) : (
                    <Ban className="h-4 w-4 text-destructive" />
                  )}
                  <span className="font-medium">{partnerName(o.partner_id)}</span>
                  <span className="text-muted-foreground">
                    {o.source_currency ?? "*"} → {o.dest_currency ?? "*"}
                    {o.dest_country ? ` · ${o.dest_country}` : ""}
                  </span>
                  {o.reason && <span className="text-xs text-muted-foreground">· {o.reason}</span>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteOverride.mutate(o.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {!overrides?.length && (
              <p className="text-sm text-muted-foreground">No overrides — the engine score decides.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LiveRoutingControlPanel;
