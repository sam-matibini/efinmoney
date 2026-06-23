import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useSafeguardingSnapshots, useRunSafeguardingCheck, SafeguardingSnapshot } from "@/hooks/useSafeguarding";

const fmt = (n: number | null) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusBadge = (status: SafeguardingSnapshot["status"]) => {
  switch (status) {
    case "breach":
      return <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/10">Breach</Badge>;
    case "variance":
      return <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">Variance</Badge>;
    default:
      return <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">OK</Badge>;
  }
};

export const SafeguardingPanel = () => {
  const { data: snapshots = [], isLoading } = useSafeguardingSnapshots();
  const runCheck = useRunSafeguardingCheck();

  const hasBreach = snapshots.some((s) => s.status === "breach");
  const lastUpdated = snapshots[0]?.snapshot_date;

  const onRun = () => {
    runCheck.mutate(undefined, {
      onSuccess: (data) => {
        if ((data as { breaches?: number })?.breaches) {
          toast.error(`Safeguarding check complete — ${data.breaches} breach(es) detected.`);
        } else {
          toast.success("Safeguarding check complete — trust funds fully cover customer balances.");
        }
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Safeguarding check failed"),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Safeguarding of End-User Funds</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Safeguarding of End-User Funds</CardTitle>
          <p className="text-sm text-muted-foreground">
            Three-way validation — trust funds must fully cover customer balances (RPAA)
            {lastUpdated ? ` · as of ${format(new Date(lastUpdated), "MMMM d, yyyy")}` : ""}
          </p>
        </div>
        <Button size="sm" onClick={onRun} disabled={runCheck.isPending}>
          {runCheck.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Run check now
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
            hasBreach
              ? "border-red-500/30 bg-red-500/5 text-red-600"
              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
          }`}
        >
          {hasBreach ? (
            <>
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Safeguarding breach — trust balance is below customer funds. Investigate immediately.</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Trust ≥ Customer Funds across all currencies.</span>
            </>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Customer Liability</TableHead>
                <TableHead className="text-right">Ledger Trust</TableHead>
                <TableHead className="text-right">Bank Trust</TableHead>
                <TableHead className="text-right">Surplus / (Deficit)</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshots.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No snapshot yet — run a check to compute the latest position.
                  </TableCell>
                </TableRow>
              ) : (
                snapshots.map((s) => (
                  <TableRow key={s.currency_code}>
                    <TableCell className="font-medium">{s.currency_code}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.customer_wallet_liability)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.ledger_trust_balance)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.bank_trust_balance)}</TableCell>
                    <TableCell
                      className={`text-right font-mono ${s.surplus_deficit < 0 ? "text-red-500" : ""}`}
                    >
                      {fmt(s.surplus_deficit)}
                    </TableCell>
                    <TableCell className="text-right">{statusBadge(s.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
