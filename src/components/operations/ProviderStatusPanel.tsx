import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ProviderFailure {
  id: string;
  recipient_country: string | null;
  target_currency: string | null;
  source_amount: number | null;
  source_currency: string | null;
  failure_reason: string | null;
  created_at: string;
}

export const ProviderStatusPanel = () => {
  const [rows, setRows] = useState<ProviderFailure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("transfers")
        .select("id, recipient_country, target_currency, source_amount, source_currency, failure_reason, created_at")
        .ilike("failure_reason", "%Provider setup required%")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20);
      setRows((data as ProviderFailure[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {rows.length === 0 ? (
            <CheckCircle2 className="w-5 h-5 text-primary" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-destructive" />
          )}
          Provider status — last 24h
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payout-provider setup failures. All corridors operating normally.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} transfer{rows.length === 1 ? "" : "s"} blocked by provider setup
              (e.g. IP whitelisting). Funds were returned to senders. Resolve in the Flutterwave
              dashboard, then retries will succeed without redeploy.
            </p>
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{r.target_currency}</Badge>
                      <Badge variant="outline">{r.recipient_country}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.id.slice(0, 8)}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2">{r.failure_reason}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
