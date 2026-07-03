import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileBox, Download, Upload, Play, CheckCircle2, Clock, Search,
  AlertTriangle, Copy, Plus, Pencil, Trash2, TrendingUp, DollarSign,
} from "lucide-react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  useReconciliations, useCreateReconciliations, useUpdateReconciliation,
  useDeleteReconciliation, useRunMatching, PROCESSORS, classifyRow,
  type ReconRow, type ReconStatus, type ReconInput,
} from "@/hooks/useSettlementReconciliation";

/* ── helpers ── */
const STATUS_STYLE: Record<ReconStatus, string> = {
  matched: "bg-emerald-500/10 text-emerald-600",
  variance: "bg-red-500/10 text-red-600",
  missing: "bg-amber-500/10 text-amber-600",
  duplicate: "bg-orange-500/10 text-orange-600",
  pending: "bg-muted text-muted-foreground",
};
const statusBadge = (s: ReconStatus) => (
  <Badge className={`text-xs ${STATUS_STYLE[s] || "bg-muted text-muted-foreground"}`}>{s}</Badge>
);
const fmt = (n: number | string | null | undefined) =>
  n == null || n === "" ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const procLabel = (p: string) => p.replace(/_/g, " ");

const TEMPLATE_HEADERS = ["processor", "processor_settlement_amount", "efinmoney_ledger_amount", "bank_statement_amount", "batch_ref", "settlement_date"];

/* RFC-4180 CSV tokenizer — handles quoted fields, embedded commas/newlines,
   escaped "" quotes and CRLF. Needed for real processor exports (e.g. Stripe). */
function tokenizeCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/* Parse a numeric cell, tolerating currency symbols / thousands separators. */
function num(s: string | undefined): number {
  if (s == null) return 0;
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/* Reconciliation template format (one row = one settlement batch). */
function parseTemplate(rows: string[][], headers: string[]): ReconInput[] {
  const idx = (name: string) => headers.indexOf(name);
  const out: ReconInput[] = [];
  for (const cells of rows) {
    const processor = (cells[idx("processor")] || "other").trim().toLowerCase();
    const proc = num(cells[idx("processor_settlement_amount")]);
    const ledger = num(cells[idx("efinmoney_ledger_amount")]);
    const bankI = idx("bank_statement_amount");
    const batchI = idx("batch_ref");
    const dateI = idx("settlement_date");
    const bankCell = bankI >= 0 ? (cells[bankI] || "").trim() : "";
    const batch = batchI >= 0 ? (cells[batchI] || "").trim() : "";
    const date = dateI >= 0 ? (cells[dateI] || "").trim() : "";
    out.push({
      processor: (PROCESSORS as readonly string[]).includes(processor) ? processor : "other",
      processor_settlement_amount: proc,
      efinmoney_ledger_amount: ledger,
      bank_statement_amount: bankCell ? num(bankCell) : null,
      batch_ref: batch || null,
      settlement_date: date || null,
    });
  }
  return out;
}

/* Stripe "Payments" export → group paid charges into one settlement per payout.
   processor amount = net (amount − fee − refunds), which is what Stripe pays
   out to the bank. Failed/declined charges never settle and are skipped. */
function parseStripeExport(rows: string[][], headers: string[]): ReconInput[] {
  const col = (name: string) => headers.indexOf(name);
  const iAmount = col("amount");
  const iFee = col("fee");
  const iRefunded = col("amount refunded");
  const iCurrency = col("currency");
  const iStatus = col("status");
  const iCaptured = col("captured");
  const iTransfer = col("transfer");
  const iCreated = col("created date (utc)");

  type Group = { net: number; gross: number; currency: string; date: string; count: number };
  const groups = new Map<string, Group>();

  for (const cells of rows) {
    const status = (iStatus >= 0 ? cells[iStatus] : "").trim().toLowerCase();
    const captured = (iCaptured >= 0 ? cells[iCaptured] : "").trim().toLowerCase();
    const paid = status === "paid" || captured === "true";
    if (!paid) continue; // skip failed / declined — they never settle

    const amount = num(cells[iAmount]);
    const fee = iFee >= 0 ? num(cells[iFee]) : 0;
    const refunded = iRefunded >= 0 ? num(cells[iRefunded]) : 0;
    const currency = ((iCurrency >= 0 ? cells[iCurrency] : "") || "usd").trim().toUpperCase();
    const payout = (iTransfer >= 0 ? cells[iTransfer] : "").trim();
    const created = (iCreated >= 0 ? cells[iCreated] : "").trim().slice(0, 10);
    const key = `${payout || `PENDING-${created}`}|${currency}`;

    const g = groups.get(key) || { net: 0, gross: 0, currency, date: created, count: 0 };
    g.net += amount - fee - refunded;
    g.gross += amount;
    if (created > g.date) g.date = created;
    g.count++;
    groups.set(key, g);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const out: ReconInput[] = [];
  for (const [key, g] of groups) {
    const payout = key.split("|")[0];
    const net = round2(g.net);
    out.push({
      processor: "stripe",
      processor_settlement_amount: net,
      efinmoney_ledger_amount: net, // provisional: assume booked at settled value; edit + re-run to reconcile
      bank_statement_amount: null,  // fill in from bank statement, then Run Matching
      batch_ref: payout.startsWith("PENDING-") ? payout : payout || null,
      settlement_date: g.date || null,
      notes: `Auto-imported from Stripe — ${g.count} charge${g.count > 1 ? "s" : ""}, gross ${round2(g.gross)} ${g.currency}, net ${net} ${g.currency}`,
    });
  }
  return out;
}

/* Detect the CSV shape and dispatch. Throws a clear error on unknown formats. */
function parseCsv(text: string): ReconInput[] {
  const table = tokenizeCsv(text.replace(/^﻿/, ""));
  if (table.length < 2) return [];
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const dataRows = table.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  if (headers.includes("processor_settlement_amount")) return parseTemplate(dataRows, headers);
  if (headers.includes("id") && headers.includes("amount") && (headers.includes("fee") || headers.includes("status"))) {
    return parseStripeExport(dataRows, headers);
  }
  throw new Error("Unrecognized CSV. Use the reconciliation template or a Stripe payments export.");
}

/* ── stat card ── */
const Stat = ({ label, value, sub, icon: Icon, color = "" }: {
  label: string; value: number | string; sub?: string; icon: React.ElementType; color?: string;
}) => (
  <Card className="min-w-0">
    <CardContent className="p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color || "text-muted-foreground"}`} />
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub != null && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
    </CardContent>
  </Card>
);

/* ── reconcile / edit dialog ── */
const emptyForm = {
  processor: "stripe",
  processor_settlement_amount: "",
  efinmoney_ledger_amount: "",
  bank_statement_amount: "",
  batch_ref: "",
  settlement_date: "",
  status: "" as ReconStatus | "",
  notes: "",
};

export const SettlementReconciliationPanel = () => {
  const [tab, setTab] = useState("settlements");
  const [dateRange, setDateRange] = useState("30d");
  const fileRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ReconRow | null>(null);

  const { data: items = [], isLoading } = useReconciliations();
  const createMut = useCreateReconciliations();
  const updateMut = useUpdateReconciliation();
  const deleteMut = useDeleteReconciliation();
  const matchMut = useRunMatching();

  /* counts from real statuses */
  const counts = useMemo(() => {
    const c: Record<ReconStatus, number> = { matched: 0, variance: 0, missing: 0, duplicate: 0, pending: 0 };
    let totalAmt = 0, varianceAmt = 0;
    for (const i of items) {
      c[i.status] = (c[i.status] || 0) + 1;
      totalAmt += Number(i.processor_settlement_amount || 0);
      varianceAmt += Number(i.variance_amount || 0);
    }
    return { ...c, totalAmt, varianceAmt };
  }, [items]);

  const days = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;
  const cutoff = subDays(new Date(), days).toISOString();
  const inRange = useMemo(() => items.filter((i) => i.created_at >= cutoff), [items, cutoff]);

  /* analytics: per-processor match rate */
  const perProcessor = useMemo(() => {
    const map = new Map<string, { total: number; matched: number; settled: number }>();
    for (const i of inRange) {
      const m = map.get(i.processor) || { total: 0, matched: 0, settled: 0 };
      m.total++;
      if (i.status === "matched") m.matched++;
      m.settled += Number(i.processor_settlement_amount || 0);
      map.set(i.processor, m);
    }
    return [...map.entries()].map(([processor, m]) => ({
      processor,
      matchRate: m.total ? Math.round((m.matched / m.total) * 100) : 0,
      settled: m.settled,
      total: m.total,
    }));
  }, [inRange]);

  /* analytics: aging waterfall of unmatched items by age bucket */
  const agingData = useMemo(() => {
    const buckets = [
      { bucket: "0–1d", min: 0, max: 1, count: 0 },
      { bucket: "1–3d", min: 1, max: 3, count: 0 },
      { bucket: "3–7d", min: 3, max: 7, count: 0 },
      { bucket: ">7d", min: 7, max: Infinity, count: 0 },
    ];
    const now = Date.now();
    for (const i of items) {
      if (i.status === "matched") continue;
      const ageDays = (now - new Date(i.created_at).getTime()) / 86_400_000;
      const b = buckets.find((x) => ageDays >= x.min && ageDays < x.max);
      if (b) b.count++;
    }
    return buckets.map(({ bucket, count }) => ({ bucket, count }));
  }, [items]);

  /* ── actions ── */
  const downloadTemplate = () => {
    const sample = "stripe,10000.00,10000.00,10000.00,BATCH-2026-001,2026-06-26";
    const csv = `${TEMPLATE_HEADERS.join(",")}\n${sample}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "settlement_reconciliation_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const text = await file.text();
        const rows = parseCsv(text);
        if (rows.length === 0) {
          toast.error("No settlements to import — the file had no rows, or all Stripe charges were failed/declined.");
        } else {
          await createMut.mutateAsync(rows);
          toast.success(`Imported ${rows.length} settlement${rows.length > 1 ? "s" : ""}`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Import failed");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const runMatching = () => {
    matchMut.mutate(items, {
      onSuccess: (n) => toast.success(n > 0 ? `Matching complete — ${n} updated` : "Matching complete — no changes"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Matching failed"),
    });
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (r: ReconRow, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditId(r.id);
    setForm({
      processor: r.processor,
      processor_settlement_amount: String(r.processor_settlement_amount ?? ""),
      efinmoney_ledger_amount: String(r.efinmoney_ledger_amount ?? ""),
      bank_statement_amount: r.bank_statement_amount == null ? "" : String(r.bank_statement_amount),
      batch_ref: r.batch_ref || "",
      settlement_date: r.settlement_date || "",
      status: r.status,
      notes: r.notes || "",
    });
    setDialogOpen(true);
  };

  const saveDialog = async () => {
    const proc = Number(form.processor_settlement_amount);
    const ledger = Number(form.efinmoney_ledger_amount);
    if (!Number.isFinite(proc) || !Number.isFinite(ledger)) {
      toast.error("Processor and ledger amounts are required");
      return;
    }
    const bank = form.bank_statement_amount === "" ? null : Number(form.bank_statement_amount);
    const base = {
      processor: form.processor,
      processor_settlement_amount: proc,
      efinmoney_ledger_amount: ledger,
      bank_statement_amount: bank,
      batch_ref: form.batch_ref || null,
      settlement_date: form.settlement_date || null,
      notes: form.notes || null,
    };
    try {
      if (editId) {
        // keep manual status override if the user picked one, else auto-classify
        const status = form.status || classifyRow(base);
        await updateMut.mutateAsync({ id: editId, ...base, status, reconciled_at: new Date().toISOString() });
        toast.success("Reconciliation updated");
      } else {
        await createMut.mutateAsync([base]);
        toast.success("Settlement added");
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const confirmDelete = () => {
    const id = deleteTarget?.id;
    if (id) {
      deleteMut.mutate(id, {
        onSuccess: () => { toast.success("Deleted"); setDeleteTarget(null); },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
      });
    }
  };

  /* row renderer with actions */
  const renderRows = (rows: ReconRow[], emptyMsg: string, cols = 8) =>
    rows.length === 0 ? (
      <TableRow><TableCell colSpan={cols} className="text-center py-10 text-muted-foreground">{emptyMsg}</TableCell></TableRow>
    ) : rows.map((i) => (
      <TableRow key={i.id} className="cursor-pointer" onClick={() => openEdit(i)}>
        <TableCell className="font-medium capitalize">{procLabel(i.processor)}</TableCell>
        <TableCell className="text-right font-mono text-sm">{fmt(i.processor_settlement_amount)}</TableCell>
        <TableCell className="text-right font-mono text-sm">{fmt(i.efinmoney_ledger_amount)}</TableCell>
        <TableCell className="text-right font-mono text-sm">{fmt(i.bank_statement_amount)}</TableCell>
        <TableCell className={`text-right font-mono text-sm ${Number(i.variance_amount) > 0.01 ? "text-red-500" : ""}`}>{fmt(i.variance_amount)}</TableCell>
        <TableCell>{statusBadge(i.status)}</TableCell>
        <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{format(new Date(i.created_at), "MMM d")}</TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => openEdit(i, e)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(i); }}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </TableCell>
      </TableRow>
    ));

  const SettlementsTable = ({ rows, emptyMsg }: { rows: ReconRow[]; emptyMsg: string }) => (
    <Card><CardContent className="p-0"><div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Processor</TableHead>
          <TableHead className="text-right">Processor $</TableHead>
          <TableHead className="text-right">Ledger $</TableHead>
          <TableHead className="text-right">Bank $</TableHead>
          <TableHead className="text-right">Variance</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Date</TableHead>
          <TableHead className="text-right w-24">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>{renderRows(rows, emptyMsg)}</TableBody>
      </Table>
    </div></CardContent></Card>
  );

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><FileBox className="w-6 h-6" /> Settlement Reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Match payment-processor payouts (Stripe, Adyen, Paysafe) against bank statement deposits.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadTemplate}><Download className="w-3.5 h-3.5" /> Template</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={createMut.isPending}>
            <Upload className="w-3.5 h-3.5" /> {createMut.isPending ? "Importing…" : "Import CSV"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openAdd}><Plus className="w-3.5 h-3.5" /> Add entry</Button>
          <Button size="sm" className="gap-1.5" onClick={runMatching} disabled={matchMut.isPending || items.length === 0}>
            <Play className="w-3.5 h-3.5" /> {matchMut.isPending ? "Running…" : "Run Matching"}
          </Button>
        </div>
      </div>

      {/* stat cards — real statuses */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Total" value={items.length} sub={fmt(counts.totalAmt)} icon={FileBox} />
        <Stat label="Matched" value={counts.matched} icon={CheckCircle2} color="text-emerald-500" />
        <Stat label="Pending" value={counts.pending} icon={Clock} color="text-muted-foreground" />
        <Stat label="Missing bank" value={counts.missing} icon={Search} color="text-amber-500" />
        <Stat label="Variance" value={counts.variance} sub={fmt(counts.varianceAmt)} icon={AlertTriangle} color="text-red-500" />
        <Stat label="Duplicate" value={counts.duplicate} icon={Copy} color="text-orange-500" />
      </div>

      {/* tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto min-w-full lg:min-w-0">
            <TabsTrigger value="settlements">Settlements</TabsTrigger>
            <TabsTrigger value="matches">Matches</TabsTrigger>
            <TabsTrigger value="review">Review queue</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="processors">Processor Accounts</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="settlements">
          {isLoading ? <Skeleton className="h-64 w-full" /> : <SettlementsTable rows={items} emptyMsg="No settlements yet. Import a CSV or add an entry." />}
        </TabsContent>
        <TabsContent value="matches">
          <SettlementsTable rows={items.filter((i) => i.status === "matched")} emptyMsg="No matched settlements yet." />
        </TabsContent>
        <TabsContent value="review">
          <SettlementsTable rows={items.filter((i) => i.status === "pending" || i.status === "missing")} emptyMsg="Review queue is empty." />
        </TabsContent>
        <TabsContent value="exceptions">
          <SettlementsTable rows={items.filter((i) => i.status === "variance" || i.status === "duplicate")} emptyMsg="No exceptions flagged." />
        </TabsContent>

        <TabsContent value="processors">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Processor</TableHead>
                <TableHead className="text-right">Settlements</TableHead>
                <TableHead className="text-right">Matched</TableHead>
                <TableHead className="text-right">Match rate</TableHead>
                <TableHead className="text-right">Total settled</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {perProcessor.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No processor activity in range.</TableCell></TableRow>
                ) : perProcessor.map((p) => (
                  <TableRow key={p.processor}>
                    <TableCell className="font-medium capitalize">{procLabel(p.processor)}</TableCell>
                    <TableCell className="text-right">{p.total}</TableCell>
                    <TableCell className="text-right">{Math.round((p.matchRate / 100) * p.total)}</TableCell>
                    <TableCell className="text-right">{p.matchRate}%</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(p.settled)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="90d">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card><CardContent className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Match rate &amp; fee analysis</h3>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Processor</TableHead>
                  <TableHead className="text-right">Match rate</TableHead>
                  <TableHead className="text-right">Settlements</TableHead>
                  <TableHead className="text-right">Settled $</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {perProcessor.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>
                  ) : perProcessor.map((p) => (
                    <TableRow key={p.processor}>
                      <TableCell className="font-medium capitalize">{procLabel(p.processor)}</TableCell>
                      <TableCell className="text-right">{p.matchRate}%</TableCell>
                      <TableCell className="text-right">{p.total}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(p.settled)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>

            <Card><CardContent className="p-4 space-y-3">
              <h3 className="font-semibold flex items-center gap-1.5"><DollarSign className="w-4 h-4" /> Aging waterfall (unmatched)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={agingData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Reconcile settlement" : "Add settlement"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Processor</Label>
                <Select value={form.processor} onValueChange={(v) => setForm({ ...form, processor: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROCESSORS.map((p) => <SelectItem key={p} value={p} className="capitalize">{procLabel(p)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Settlement date</Label>
                <Input type="date" value={form.settlement_date} onChange={(e) => setForm({ ...form, settlement_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Processor $</Label>
                <Input type="number" step="0.01" value={form.processor_settlement_amount} onChange={(e) => setForm({ ...form, processor_settlement_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Ledger $</Label>
                <Input type="number" step="0.01" value={form.efinmoney_ledger_amount} onChange={(e) => setForm({ ...form, efinmoney_ledger_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Bank $</Label>
                <Input type="number" step="0.01" placeholder="—" value={form.bank_statement_amount} onChange={(e) => setForm({ ...form, bank_statement_amount: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Batch ref</Label>
                <Input value={form.batch_ref} onChange={(e) => setForm({ ...form, batch_ref: e.target.value })} placeholder="BATCH-2026-001" />
              </div>
              {editId && (
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={form.status || undefined} onValueChange={(v) => setForm({ ...form, status: v as ReconStatus })}>
                    <SelectTrigger><SelectValue placeholder="Auto" /></SelectTrigger>
                    <SelectContent>
                      {(["matched", "variance", "missing", "duplicate", "pending"] as ReconStatus[]).map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional reconciliation notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveDialog} disabled={createMut.isPending || updateMut.isPending}>
              {createMut.isPending || updateMut.isPending ? "Saving…" : editId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete settlement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the <strong className="capitalize">{deleteTarget ? procLabel(deleteTarget.processor) : ""}</strong> settlement of {fmt(deleteTarget?.processor_settlement_amount)}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
