import { useMemo, useState } from "react";
import { useCorridorReadiness, useRefreshLiquidity } from "@/hooks/useCostAssurance";
import { useSetCorridorLive } from "@/hooks/useRoutingEngine";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";

const Flag = ({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) => (
  <span
    className={`inline-flex items-center gap-1 text-xs ${
      !ok ? "text-destructive" : warn ? "text-amber-500" : "text-muted-foreground"
    }`}
    title={label}
  >
    {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
    {label}
  </span>
);

export const CorridorReadinessPanel = () => {
  const { data, isLoading, refetch, isFetching } = useCorridorReadiness();
  const refreshLiquidity = useRefreshLiquidity();
  const setLive = useSetCorridorLive();
  const [search, setSearch] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => (onlyBlocked ? !r.ready : true))
      .filter((r) =>
        !q
          ? true
          : [r.partner_name, r.partner_code, r.source_currency, r.dest_currency, r.dest_country, r.payment_method]
              .join(" ")
              .toLowerCase()
              .includes(q),
      );
  }, [data, search, onlyBlocked]);

  const readyCount = (data ?? []).filter((r) => r.ready).length;
  const liveCount = (data ?? []).filter((r) => r.live_routing_enabled).length;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Corridor readiness
            </CardTitle>
            <CardDescription>
              A corridor can only be routed live once it has pricing, an FX quote where needed, fresh liquidity and
              recorded performance. Anything missing is shown below.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshLiquidity.mutate()}
              disabled={refreshLiquidity.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshLiquidity.isPending ? "animate-spin" : ""}`} />
              Refresh liquidity
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Recheck
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{readyCount} ready</Badge>
          <Badge variant="default">{liveCount} live</Badge>
          <Input
            placeholder="Search corridor or partner"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={onlyBlocked} onCheckedChange={setOnlyBlocked} />
            <span>Only blocked</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !rows.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No corridors match.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Corridor</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Requirements</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.corridor_id}>
                    <TableCell>
                      <span className="font-medium">
                        {r.source_currency} → {r.dest_currency}
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {r.dest_country || "—"} · {(r.payment_method || "any").replace(/_/g, " ")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{r.partner_name}</span>
                      <div className="text-xs text-muted-foreground">{r.partner_code}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <Flag ok={r.has_pricing} label="pricing" />
                        <Flag ok={r.has_fx} label="fx" />
                        <Flag ok={r.has_liquidity && !r.liquidity_stale} warn={r.liquidity_stale} label={r.liquidity_stale ? "liquidity stale" : "liquidity"} />
                        <Flag ok={r.has_performance} label="performance" />
                        <Flag ok={r.enabled} label="enabled" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.ready ? (
                        <Badge variant="secondary">Ready</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" /> Blocked
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={r.live_routing_enabled}
                        disabled={!r.ready && !r.live_routing_enabled}
                        onCheckedChange={(v) => setLive.mutate({ id: r.corridor_id, live: v })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CorridorReadinessPanel;
