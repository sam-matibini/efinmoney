import {
  useFundingTasks,
  useLiquidityForecasts,
  useRunForecastScan,
  useUpdateFundingTask,
  type FundingTask,
} from "@/hooks/usePartnerOps";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Banknote, RefreshCw, Check, X } from "lucide-react";

const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const runwayClass = (days: number | null, status: string) => {
  if (status === "critical") return "text-destructive font-semibold";
  if (status === "warning") return "text-warning font-medium";
  if (days == null) return "text-muted-foreground";
  return "";
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" =>
  s === "critical" ? "destructive" : s === "warning" ? "secondary" : "default";

const taskVariant = (s: FundingTask["status"]): "default" | "secondary" | "destructive" | "outline" =>
  s === "funded" ? "default" : s === "cancelled" ? "outline" : s === "in_progress" ? "secondary" : "destructive";

export const LiquidityForecastPanel = () => {
  const { data: rows, isLoading } = useLiquidityForecasts();
  const { data: tasks, isLoading: tasksLoading } = useFundingTasks();
  const updateTask = useUpdateFundingTask();
  const scan = useRunForecastScan();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" /> Float runway
            </CardTitle>
            <CardDescription>
              Forecast daily burn against usable partner float (available balance less required reserve).
              Corridors trending short automatically open a pre-funding task.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => scan.mutate()} disabled={scan.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${scan.isPending ? "animate-spin" : ""}`} />
            Recalculate
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !rows?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No liquidity data yet — recalculate once partner balances have been refreshed.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reserve</TableHead>
                    <TableHead className="text-right">Usable</TableHead>
                    <TableHead className="text-right">Daily burn</TableHead>
                    <TableHead className="text-right">Days to dry</TableHead>
                    <TableHead className="text-right">Suggested top-up</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.partner_name}</TableCell>
                      <TableCell>{r.currency_code}</TableCell>
                      <TableCell className="text-right">{money(r.available_balance)}</TableCell>
                      <TableCell className="text-right">{money(r.required_reserve)}</TableCell>
                      <TableCell className="text-right">{money(r.usable_balance)}</TableCell>
                      <TableCell className="text-right">{money(r.forecast_daily_burn)}</TableCell>
                      <TableCell className={`text-right ${runwayClass(r.days_to_dry, r.status)}`}>
                        {r.days_to_dry == null ? "—" : `${r.days_to_dry.toFixed(1)}d`}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.recommended_topup > 0 ? money(r.recommended_topup) : "—"}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant(r.status)}>{r.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pre-funding queue</CardTitle>
          <CardDescription>
            One open task per partner and currency. Tasks auto-close when the runway recovers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasksLoading ? (
            <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !tasks?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No funding tasks.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Due by</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.partner_name}</TableCell>
                      <TableCell>{t.currency_code}</TableCell>
                      <TableCell className="text-right">{money(t.amount)}</TableCell>
                      <TableCell>{t.due_by ? new Date(t.due_by).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.source}</TableCell>
                      <TableCell><Badge variant={taskVariant(t.status)}>{t.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {(t.status === "open" || t.status === "in_progress") && (
                          <div className="flex justify-end gap-2">
                            {t.status === "open" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateTask.mutate({ id: t.id, status: "in_progress" })}
                                disabled={updateTask.isPending}
                              >
                                Start
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => updateTask.mutate({ id: t.id, status: "funded" })}
                              disabled={updateTask.isPending}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Funded
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateTask.mutate({ id: t.id, status: "cancelled" })}
                              disabled={updateTask.isPending}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
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

export default LiquidityForecastPanel;
