import { useState } from "react";
import { usePaymentPartners } from "@/hooks/usePartnerNetwork";
import {
  usePartnerAlerts,
  useRunPartnerAlertScan,
  useUpdatePartnerAlert,
  type PartnerAlertStatus,
} from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, RefreshCw, Check, CheckCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const severityVariant = (s: string) =>
  s === "critical" ? "destructive" : s === "warning" ? "default" : "secondary";

const TYPE_LABEL: Record<string, string> = {
  margin_floor: "Margin",
  negative_profit: "Negative profit",
  pricing_gap: "Pricing gap",
  corridor_not_ready: "Readiness",
  liquidity_low: "Liquidity",
};

export const PartnerAlertsPanel = () => {
  const [status, setStatus] = useState<PartnerAlertStatus | "all">("open");
  const { data: alerts, isLoading } = usePartnerAlerts(status);
  const { data: partners } = usePaymentPartners();
  const scan = useRunPartnerAlertScan();
  const update = useUpdatePartnerAlert();

  const partnerName = (id: string | null) =>
    (id && partners?.find((p) => p.id === id)?.name) || "Network";

  const counts = {
    critical: (alerts ?? []).filter((a) => a.severity === "critical").length,
    warning: (alerts ?? []).filter((a) => a.severity === "warning").length,
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Network alerts
          </CardTitle>
          <CardDescription>
            Margin floors, loss-making traffic, pricing gaps, corridor readiness and liquidity headroom. Scanned
            hourly; alerts auto-resolve once the underlying issue clears.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as PartnerAlertStatus | "all")}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${scan.isPending ? "animate-spin" : ""}`} /> Run scan
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Critical", value: counts.critical, warn: counts.critical > 0 },
            { label: "Warnings", value: counts.warning, warn: false },
            { label: "Showing", value: alerts?.length ?? 0, warn: false },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${k.warn ? "text-destructive" : ""}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !alerts?.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No {status === "all" ? "" : status} alerts. Run a scan to evaluate the network now.
          </p>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(a.severity) as never}>{a.severity}</Badge>
                      <Badge variant="outline">{TYPE_LABEL[a.alert_type] ?? a.alert_type}</Badge>
                      <span className="font-medium">{a.title}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{a.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {partnerName(a.partner_id)}
                      {a.corridor_key ? ` · ${a.corridor_key}` : ""} · seen {a.occurrences}× · last{" "}
                      {formatDistanceToNow(new Date(a.last_seen_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {a.status === "open" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => update.mutate({ id: a.id, status: "acknowledged" })}
                      >
                        <Check className="h-4 w-4 mr-1" /> Acknowledge
                      </Button>
                    )}
                    {a.status !== "resolved" && (
                      <Button size="sm" onClick={() => update.mutate({ id: a.id, status: "resolved" })}>
                        <CheckCheck className="h-4 w-4 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PartnerAlertsPanel;
