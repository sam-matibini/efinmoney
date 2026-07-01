import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFxClearingBalances, useSweepFxClearing } from "@/hooks/useFxClearing";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const FxClearingExposurePanel = () => {
  const { data: balances = [], isLoading } = useFxClearingBalances();
  const sweep = useSweepFxClearing();

  const onSweep = () => {
    sweep.mutate(undefined, {
      onSuccess: (results) => {
        if (results.length === 0) {
          toast.success("Nothing to sweep — all FX Clearing accounts are within rounding tolerance.");
        } else {
          const summary = results.map((r) => `${r.swept_currency} ${fmt(r.swept_amount)} → ${r.posted_to}`).join(", ");
          toast.success(`FX Clearing swept: ${summary}`);
        }
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Sweep failed"),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>FX Clearing Exposure</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>FX Clearing Exposure</CardTitle>
          <p className="text-sm text-muted-foreground">
            Unresolved cross-currency plugs posted by the auto-balancing ledger trigger — recognize to FX Gain/Loss when reviewed.
          </p>
        </div>
        <Button size="sm" onClick={onSweep} disabled={sweep.isPending} className="gap-1.5 shrink-0">
          {sweep.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
          Sweep to FX Gain/Loss
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No unresolved FX Clearing balances — nothing outstanding.
                  </TableCell>
                </TableRow>
              ) : (
                balances.map((b) => (
                  <TableRow key={b.account_id}>
                    <TableCell className="font-mono">{b.code}</TableCell>
                    <TableCell>{b.currency_code}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(Math.abs(b.balance))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {b.balance > 0 ? "Debit (→ FX Loss)" : "Credit (→ FX Gain)"}
                    </TableCell>
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
