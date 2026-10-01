import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Download, Eye, EyeOff, Landmark, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { invokeEdgeFunction, stringifyErrorValue } from "@/lib/invokeEdgeFunction";
import { craPaymentType, maskSin } from "@/lib/craPayment";
import { toast } from "sonner";

interface CraRow {
  id: string;
  user_id: string;
  reference: string;
  taxpayer_type: "individual" | "business";
  taxpayer_name: string;
  sin: string | null;
  business_number: string | null;
  program_account: string | null;
  payment_type: string;
  period: string;
  amount: number;
  status: string;
  bank_confirmation: string | null;
  remitted_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

const TABS = ["queued", "remitted", "confirmed", "refunded", "cancelled"] as const;
type Tab = (typeof TABS)[number];

const STATUS_CLASS: Record<string, string> = {
  queued: "bg-amber-500/10 text-amber-700",
  remitted: "bg-sky-500/10 text-sky-700",
  confirmed: "bg-emerald-500/10 text-emerald-700",
  refunded: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

type DialogState =
  | { kind: "remit"; row: CraRow }
  | { kind: "refund"; row: CraRow }
  | null;

function identifier(r: CraRow) {
  return r.taxpayer_type === "individual" ? r.sin ?? "" : `${r.business_number ?? ""}${r.program_account ?? ""}`;
}

function copy(text: string, label: string) {
  void navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export default function CraPaymentsAdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("queued");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogInput, setDialogInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-cra-payments", tab],
    queryFn: async (): Promise<CraRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("cra_payments")
        .select("*")
        .eq("status", tab)
        .order("created_at", { ascending: tab === "queued" })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const { data: customers = {} } = useQuery({
    queryKey: ["admin-cra-customers", rows.map((r) => r.user_id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", ids);
      return Object.fromEntries((data ?? []).map((p) => [p.user_id, p])) as Record<string, { full_name: string | null; email: string | null }>;
    },
  });

  const queuedTotal = useMemo(
    () => (tab === "queued" ? rows.reduce((s, r) => s + Number(r.amount), 0) : 0),
    [rows, tab],
  );

  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin-cra-payments"] });

  const act = async (row: CraRow, action: "remit" | "confirm" | "refund", extra: Record<string, unknown> = {}) => {
    setBusyId(row.id);
    try {
      await invokeEdgeFunction("cra-payment", { action, id: row.id, ...extra });
      toast.success(action === "remit" ? "Marked as sent to CRA" : action === "confirm" ? "Marked as received by CRA" : "Refunded to customer wallet");
      setDialog(null);
      setDialogInput("");
      refresh();
    } catch (e) {
      toast.error(stringifyErrorValue(e) || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => {
    const header = ["reference", "created_at", "taxpayer_name", "taxpayer_type", "identifier", "bank_payee", "period", "amount_cad"];
    const lines = rows.map((r) => [
      r.reference,
      r.created_at,
      r.taxpayer_name,
      r.taxpayer_type,
      identifier(r),
      craPaymentType(r.payment_type)?.payee ?? r.payment_type,
      r.period,
      Number(r.amount).toFixed(2),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cra-remittances-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AdminLayout>
      <div className="container px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRA remittances</h1>
          <p className="text-muted-foreground">
            Customer CRA payments to send through corporate online-banking bill pay. Pay each one to the listed CRA payee with the
            customer&apos;s SIN or BN + program account as the account number, then record the bank confirmation.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">{tab === "queued" ? rows.length : "—"}</div><div className="text-xs text-muted-foreground">Waiting to send</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3"><div className="text-2xl font-bold">C${queuedTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div><div className="text-xs text-muted-foreground">Queued total</div></CardContent></Card>
          <Card><CardContent className="pt-4 pb-3 text-xs text-muted-foreground">Send queued payments every business day. FINTRAC: keep records for C$1,000+ remittances for 5 years.</CardContent></Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => (
            <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} className="capitalize">{t}</Button>
          ))}
          {tab === "queued" && rows.length > 0 && (
            <Button size="sm" variant="outline" className="ml-auto" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Landmark className="w-5 h-5" />{tab[0].toUpperCase() + tab.slice(1)} payments</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Taxpayer / account #</TableHead>
                    <TableHead>Bank payee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No {tab} CRA payments.</TableCell></TableRow>
                  ) : rows.map((r) => {
                    const type = craPaymentType(r.payment_type);
                    const id = identifier(r);
                    const shown = revealed[r.id] || r.taxpayer_type === "business";
                    const customer = customers[r.user_id];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d, HH:mm")}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{customer?.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{customer?.email || r.user_id.slice(0, 8)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{r.taxpayer_name}</div>
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{shown ? id : maskSin(id)}</span>
                            {r.taxpayer_type === "individual" && (
                              <button type="button" onClick={() => setRevealed((s) => ({ ...s, [r.id]: !s[r.id] }))} aria-label="Toggle SIN">
                                {shown ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            )}
                            <button type="button" onClick={() => copy(id, r.taxpayer_type === "individual" ? "SIN" : "Account")} aria-label="Copy account number">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs max-w-[220px]">
                          <div>{type?.payee ?? r.payment_type}</div>
                          <div className="text-muted-foreground">{type?.label}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.period}</TableCell>
                        <TableCell className="font-mono whitespace-nowrap">
                          C${Number(r.amount).toFixed(2)}
                          <button type="button" className="ml-1 align-middle" onClick={() => copy(Number(r.amount).toFixed(2), "Amount")} aria-label="Copy amount">
                            <Copy className="w-3 h-3 inline" />
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_CLASS[r.status] ?? ""}>{r.status}</Badge>
                          {r.bank_confirmation && <div className="font-mono text-[11px] text-muted-foreground mt-1">{r.bank_confirmation}</div>}
                          {r.failure_reason && <div className="text-[11px] text-muted-foreground mt-1 max-w-[160px]">{r.failure_reason}</div>}
                        </TableCell>
                        <TableCell className="text-right space-x-1 whitespace-nowrap">
                          {busyId === r.id ? <Loader2 className="w-4 h-4 animate-spin inline" /> : (
                            <>
                              {r.status === "queued" && (
                                <Button size="sm" onClick={() => { setDialogInput(""); setDialog({ kind: "remit", row: r }); }}>Mark sent</Button>
                              )}
                              {r.status === "remitted" && (
                                <Button size="sm" variant="outline" onClick={() => act(r, "confirm")}>CRA received</Button>
                              )}
                              {(r.status === "queued" || r.status === "remitted") && (
                                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setDialogInput(""); setDialog({ kind: "refund", row: r }); }}>Refund</Button>
                              )}
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => { if (!o) setDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.kind === "remit" ? "Record CRA bill payment" : "Refund to customer"}</DialogTitle>
          </DialogHeader>
          {dialog && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {dialog.row.taxpayer_name} · C${Number(dialog.row.amount).toFixed(2)} · {craPaymentType(dialog.row.payment_type)?.label}
              </p>
              <div>
                <Label htmlFor="cra-dialog-input">
                  {dialog.kind === "remit" ? "Bank confirmation number" : "Reason (shown to the customer)"}
                </Label>
                <Input
                  id="cra-dialog-input"
                  className="mt-1"
                  value={dialogInput}
                  onChange={(e) => setDialogInput(e.target.value)}
                  placeholder={dialog.kind === "remit" ? "From your online banking receipt" : "e.g. CRA rejected — invalid SIN"}
                />
              </div>
              {dialog.kind === "refund" && dialog.row.status === "remitted" && (
                <p className="text-xs text-amber-600">Only refund a sent payment once CRA has returned the funds to our bank account.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Close</Button>
            <Button
              variant={dialog?.kind === "refund" ? "destructive" : "default"}
              disabled={dialogInput.trim().length < 3 || !!busyId}
              onClick={() => dialog && act(
                dialog.row,
                dialog.kind,
                dialog.kind === "remit" ? { bank_confirmation: dialogInput.trim() } : { reason: dialogInput.trim() },
              )}
            >
              {dialog?.kind === "remit" ? "Mark as sent" : "Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
