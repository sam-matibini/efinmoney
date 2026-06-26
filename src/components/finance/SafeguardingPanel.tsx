import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, ShieldAlert, RefreshCw, Loader2, Landmark } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  useSafeguardingSnapshots, useRunSafeguardingCheck, useTrustAccounts,
  useRecordTrustBalance, SafeguardingSnapshot,
} from "@/hooks/useSafeguarding";

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
  const { data: trustAccounts = [] } = useTrustAccounts();
  const runCheck = useRunSafeguardingCheck();
  const recordBalance = useRecordTrustBalance();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ bankAccountId: "", balance: "", asOf: new Date().toISOString().slice(0, 10) });

  const hasBreach = snapshots.some((s) => s.status === "breach");
  const hasBankFeed = snapshots.some((s) => s.bank_trust_balance != null);
  const lastUpdated = snapshots[0]?.snapshot_date;

  const submitBalance = () => {
    const bal = Number(form.balance);
    if (!form.bankAccountId) { toast.error("Select a trust account"); return; }
    if (!Number.isFinite(bal)) { toast.error("Enter a valid balance"); return; }
    recordBalance.mutate(
      { bankAccountId: form.bankAccountId, balance: bal, asOf: form.asOf },
      {
        onSuccess: () => { toast.success("Trust balance recorded — snapshot refreshed"); setDialogOpen(false); setForm({ ...form, balance: "" }); },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record balance"),
      },
    );
  };

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
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)} className="gap-1.5">
            <Landmark className="w-4 h-4" /> Record trust balance
          </Button>
          <Button size="sm" onClick={onRun} disabled={runCheck.isPending}>
            {runCheck.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Run check now
          </Button>
        </div>
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

        {!hasBankFeed && snapshots.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>No external trust-account balance recorded — coverage is ledger-only. Record a trust balance for full three-way assurance.</span>
          </div>
        )}

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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record trust-account balance</DialogTitle></DialogHeader>
          {trustAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No active trust accounts found. Add a bank account with type <strong>Trust Account</strong> under
              Finance → Bank Accounts first, then record its statement balance here.
            </p>
          ) : (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Trust account</Label>
                <Select value={form.bankAccountId} onValueChange={(v) => setForm({ ...form, bankAccountId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select trust account" /></SelectTrigger>
                  <SelectContent>
                    {trustAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.bank_name} · {a.account_name} ({a.currency_code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Statement balance</Label>
                  <Input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label>As of</Label>
                  <Input type="date" value={form.asOf} onChange={(e) => setForm({ ...form, asOf: e.target.value })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitBalance} disabled={recordBalance.isPending || trustAccounts.length === 0}>
              {recordBalance.isPending ? "Saving…" : "Record & recompute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
