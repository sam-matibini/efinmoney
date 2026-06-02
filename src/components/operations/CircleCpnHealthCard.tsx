import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CpnTransfer {
  id: string;
  circle_status: string | null;
  circle_transfer_id: string | null;
  source_amount: number | null;
  source_currency: string | null;
  target_currency: string | null;
  recipient_country: string | null;
  created_at: string;
  status: string | null;
}

export const CircleCpnHealthCard = () => {
  const [rows, setRows] = useState<CpnTransfer[]>([]);
  const [enabledCorridors, setEnabledCorridors] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: transfers }, { count }] = await Promise.all([
        supabase
          .from("transfers")
          .select("id, circle_status, circle_transfer_id, source_amount, source_currency, target_currency, recipient_country, created_at, status")
          .not("circle_transfer_id", "is", null)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("cpn_corridors").select("id", { count: "exact", head: true }).eq("enabled", true),
      ]);
      setRows((transfers as CpnTransfer[]) || []);
      setEnabledCorridors(count || 0);
      setLoading(false);
    })();
  }, []);

  const pending = rows.filter((r) => r.circle_status && !["completed", "failed", "returned"].includes(r.circle_status));
  const failed = rows.filter((r) => r.circle_status === "failed" || r.status === "failed");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          Circle CPN — last 24h
          <Badge variant="outline" className="ml-auto">{enabledCorridors} corridor{enabledCorridors === 1 ? "" : "s"} live</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No CPN payouts in the last 24h.</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1"><CheckCircle2 className="w-3 h-3 text-green-600" /> {rows.length - pending.length - failed.length} settled</Badge>
              <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3 text-amber-500" /> {pending.length} pending</Badge>
              <Badge variant="outline" className="gap-1"><AlertTriangle className="w-3 h-3 text-destructive" /> {failed.length} failed</Badge>
            </div>
            <div className="space-y-2">
              {rows.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{r.source_currency}→{r.target_currency}</Badge>
                    <span className="text-muted-foreground">{r.recipient_country}</span>
                    <span className="font-mono text-xs text-muted-foreground">{r.id.slice(0, 8)}</span>
                  </div>
                  <Badge variant={r.circle_status === "completed" ? "default" : r.circle_status === "failed" ? "destructive" : "outline"}>
                    {r.circle_status || r.status || "—"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
