import { useRoutingAttempts } from "@/hooks/useRoutingEngine";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const outcomeVariant = (o: string) =>
  o === "success" ? "default" : o === "skipped" ? "secondary" : "destructive";

export const RoutingAttemptsPanel = () => {
  const { data, isLoading } = useRoutingAttempts(100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution attempts</CardTitle>
        <CardDescription>
          Every partner call the engine made, in order, including failovers.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data?.length ? (
          <p className="text-sm text-muted-foreground">No routed executions yet.</p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto rounded-lg border">
            {data.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    #{a.attempt_number} · {a.partner_code ?? "—"}
                    <span className="ml-2 text-xs text-muted-foreground">{a.function_slug}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                    {a.latency_ms != null ? ` · ${a.latency_ms} ms` : ""}
                    {a.error_message ? ` · ${a.error_message}` : ""}
                  </p>
                </div>
                <Badge variant={outcomeVariant(a.outcome) as never}>{a.outcome}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RoutingAttemptsPanel;
