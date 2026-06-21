import { useTreasuryWorker } from "@/hooks/useTreasuryWorker";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Play, Wallet, ArrowRightLeft, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

const JOB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-600",
  stripe_payout_initiated: "bg-blue-500/20 text-blue-600",
  awaiting_flw_credit: "bg-purple-500/20 text-purple-600",
  completed: "bg-green-500/20 text-green-600",
  failed: "bg-destructive/20 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function TreasuryWorkerPanel() {
  const { balances, pendingTransfers, settlementJobs, syncBalances, runWorker } = useTreasuryWorker();

  const rows = balances.data ?? [];
  const stripeUsd = rows.find((b) => b.provider === "stripe" && b.currency === "USD");
  const flwNgn = rows.find((b) => b.provider === "flutterwave" && b.currency === "NGN");
  const flwUsd = rows.find((b) => b.provider === "flutterwave" && b.currency === "USD");
  const neverSynced = rows.length === 0;

  const pendingTotal = (pendingTransfers.data ?? []).reduce(
    (s, t) => s + Number(t.target_amount ?? 0),
    0,
  );

  const handleSync = async () => {
    try {
      await syncBalances.mutateAsync();
      toast({ title: "Balances synced" });
    } catch (e) {
      toast({ title: "Sync failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleRunWorker = async () => {
    try {
      const result = await runWorker.mutateAsync(false);
      const processed = (result?.processed as unknown[])?.length ?? 0;
      toast({
        title: "Worker finished",
        description: `Processed ${processed} queued transfer(s).`,
      });
    } catch (e) {
      toast({ title: "Worker failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (balances.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Settlement Worker</AlertTitle>
        <AlertDescription>
          Queues payouts when Flutterwave balance is low. Optionally triggers Stripe payouts to your
          linked bank (set <code className="text-xs">TREASURY_AUTO_STRIPE_PAYOUT=true</code> on the server).
          Wire bank → Flutterwave is still required unless you prefund FLW directly.
        </AlertDescription>
      </Alert>

      {neverSynced && (
        <Alert variant="default">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No balance snapshot yet</AlertTitle>
          <AlertDescription>
            Click <strong>Sync balances</strong> after deploying edge functions{" "}
            <code className="text-xs">treasury-sync-balances</code> and{" "}
            <code className="text-xs">treasury-worker</code> to Supabase.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleSync} disabled={syncBalances.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncBalances.isPending ? "animate-spin" : ""}`} />
          Sync balances
        </Button>
        <Button size="sm" onClick={handleRunWorker} disabled={runWorker.isPending}>
          <Play className="h-4 w-4 mr-2" />
          Run worker
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Stripe USD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {stripeUsd ? fmtMoney(Number(stripeUsd.available_amount), "USD") : "—"}
            </p>
            {stripeUsd?.pending_amount ? (
              <p className="text-xs text-muted-foreground">
                Pending: {fmtMoney(Number(stripeUsd.pending_amount), "USD")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Flutterwave NGN
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {flwNgn ? `₦${Number(flwNgn.available_amount).toLocaleString()}` : "—"}
            </p>
            {flwUsd ? (
              <p className="text-xs text-muted-foreground">
                FLW USD: {fmtMoney(Number(flwUsd.available_amount), "USD")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" /> Queued payouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingTransfers.data?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {pendingTotal > 0 ? `₦${pendingTotal.toLocaleString()} waiting` : "None"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Pending liquidity transfers
          </CardTitle>
          <CardDescription>Will auto-send when Flutterwave balance is sufficient</CardDescription>
        </CardHeader>
        <CardContent>
          {!pendingTransfers.data?.length ? (
            <p className="text-sm text-muted-foreground">No transfers waiting on settlement.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Queued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingTransfers.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.recipient_name}</TableCell>
                    <TableCell>
                      {fmtMoney(Number(t.target_amount), t.target_currency)}
                    </TableCell>
                    <TableCell>{t.recipient_country}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlement jobs</CardTitle>
          <CardDescription>Stripe → bank → Flutterwave funding pipeline</CardDescription>
        </CardHeader>
        <CardContent>
          {!settlementJobs.data?.length ? (
            <p className="text-sm text-muted-foreground">No settlement jobs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Need</TableHead>
                  <TableHead>Est. USD</TableHead>
                  <TableHead>Stripe payout</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlementJobs.data.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>
                      <Badge className={JOB_STATUS_COLORS[j.status] ?? ""} variant="outline">
                        {j.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>₦{Number(j.dest_amount_needed).toLocaleString()}</TableCell>
                    <TableCell>
                      {j.source_amount != null ? fmtMoney(Number(j.source_amount), "USD") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{j.stripe_payout_id ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
