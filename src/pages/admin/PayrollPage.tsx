import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  DollarSign, Users, CheckCircle2, Clock, ChevronDown, ChevronRight,
  Plus, Pencil, Trash2, ShieldCheck, Banknote, AlertCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type PayrollRun = {
  id: string;
  period_start: string;
  period_end: string;
  status: "draft" | "approved" | "paid";
  notes: string | null;
  total_gross: number | null;
  total_net: number | null;
  entry_count: number | null;
  run_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
};

type PayrollEntry = {
  id: string;
  run_id: string;
  staff_id: string;
  gross: number;
  deductions: { tax: number; pension: number; other: number };
  net: number;
  notes: string | null;
  paid_at: string | null;
  bank_account_id: string | null;
  admin_users?: { full_name: string | null; email: string | null; position: string | null };
  staff_bank_accounts?: { bank_name: string; account_number: string; account_name: string } | null;
};

type StaffSalary = {
  id: string;
  staff_id: string;
  base_amount: number;
  currency: string;
  pay_schedule: string;
  pay_day: number;
  bank_account_id: string | null;
  effective_date: string;
  created_at: string;
  admin_users?: { full_name: string | null; email: string | null; position: string | null; department: string | null };
  staff_bank_accounts?: { bank_name: string; account_number: string } | null;
};

type StaffBankAccount = {
  id: string;
  staff_id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  routing_code: string | null;
  currency: string;
  is_primary: boolean;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
  admin_users?: { full_name: string | null; email: string | null };
};

type ActiveStaff = {
  id: string;
  full_name: string | null;
  email: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CURRENCIES = ["NGN", "CAD", "ZMW", "USD", "GBP"];
const PAY_SCHEDULES = ["monthly", "biweekly", "weekly"];

const fmtAmount = (n: number, currency = "NGN") =>
  new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const statusBadge = (status: string) => {
  if (status === "paid") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Paid</Badge>;
  if (status === "approved") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Approved</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
};

const initials = (name: string | null | undefined, email: string | null | undefined) =>
  ((name || email || "S").charAt(0)).toUpperCase();

// ─── RunsTab ─────────────────────────────────────────────────────────────────

const RunsTab = () => {
  const qc = useQueryClient();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ run: PayrollRun; action: "approve" | "mark_paid" } | null>(null);
  const [editEntry, setEditEntry] = useState<PayrollEntry | null>(null);
  const [editForm, setEditForm] = useState({ gross: "", tax: "", pension: "", other: "", notes: "" });

  const [newRunForm, setNewRunForm] = useState({
    period_start: "",
    period_end: "",
    notes: "",
  });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["payroll-runs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payroll_runs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as PayrollRun[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["payroll-entries", expandedRun],
    enabled: !!expandedRun,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payroll_entries")
        .select("*, admin_users(full_name, email, position), staff_bank_accounts(bank_name, account_number, account_name)")
        .eq("run_id", expandedRun);
      if (error) throw error;
      return (data || []) as PayrollEntry[];
    },
  });

  const { data: activeStaff = [] } = useQuery({
    queryKey: ["active-staff-for-payroll"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_users")
        .select("id, full_name, email")
        .eq("status", "active");
      if (error) throw error;
      return (data || []) as ActiveStaff[];
    },
  });

  const { data: allSalaries = [] } = useQuery({
    queryKey: ["staff-salaries-for-run"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_salaries")
        .select("*, staff_bank_accounts(id, bank_name, account_number)")
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffSalary[];
    },
  });

  const createRunMutation = useMutation({
    mutationFn: async () => {
      if (!newRunForm.period_start || !newRunForm.period_end) throw new Error("Period dates are required");

      const { data: { user } } = await supabase.auth.getUser();

      // Get latest salary per staff member
      const latestSalaries = new Map<string, StaffSalary>();
      for (const s of allSalaries) {
        if (!latestSalaries.has(s.staff_id)) latestSalaries.set(s.staff_id, s);
      }

      // Only include active staff who have a salary set
      const eligibleStaff = activeStaff.filter((s) => latestSalaries.has(s.id));

      if (eligibleStaff.length === 0) throw new Error("No active staff have salaries configured. Add salaries in the Salaries tab first.");

      // Calculate totals
      let totalGross = 0;
      let totalNet = 0;
      const entriesToInsert: Array<{
        run_id: string;
        staff_id: string;
        salary_id: string;
        bank_account_id: string | null;
        gross: number;
        deductions: { tax: number; pension: number; other: number };
        net: number;
      }> = [];

      // Create the run first
      const { data: run, error: runErr } = await (supabase as any)
        .from("payroll_runs")
        .insert({
          period_start: newRunForm.period_start,
          period_end: newRunForm.period_end,
          notes: newRunForm.notes || null,
          status: "draft",
          run_by: user?.id,
        })
        .select()
        .single();
      if (runErr) throw runErr;

      for (const staff of eligibleStaff) {
        const salary = latestSalaries.get(staff.id)!;
        const gross = Number(salary.base_amount);
        const deductions = { tax: 0, pension: 0, other: 0 };
        const net = gross - deductions.tax - deductions.pension - deductions.other;
        totalGross += gross;
        totalNet += net;
        entriesToInsert.push({
          run_id: run.id,
          staff_id: staff.id,
          salary_id: salary.id,
          bank_account_id: salary.bank_account_id,
          gross,
          deductions,
          net,
        });
      }

      if (entriesToInsert.length > 0) {
        const { error: entryErr } = await (supabase as any)
          .from("payroll_entries")
          .insert(entriesToInsert);
        if (entryErr) throw entryErr;
      }

      // Update run totals
      await (supabase as any)
        .from("payroll_runs")
        .update({ total_gross: totalGross, total_net: totalNet, entry_count: entriesToInsert.length })
        .eq("id", run.id);

      return run;
    },
    onSuccess: () => {
      toast.success("Payroll run created");
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      setNewRunOpen(false);
      setNewRunForm({ period_start: "", period_end: "", notes: "" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create run"),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ run, action }: { run: PayrollRun; action: "approve" | "mark_paid" }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("process-payroll", {
        body: { run_id: run.id, action },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (res.error) throw new Error(res.error.message || "Action failed");
      const body = res.data as { error?: string };
      if (body?.error) throw new Error(body.error);
    },
    onSuccess: () => {
      toast.success("Done");
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      qc.invalidateQueries({ queryKey: ["payroll-entries", expandedRun] });
      setConfirmAction(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const updateEntryMutation = useMutation({
    mutationFn: async () => {
      if (!editEntry) return;
      const gross = parseFloat(editForm.gross);
      const tax = parseFloat(editForm.tax) || 0;
      const pension = parseFloat(editForm.pension) || 0;
      const other = parseFloat(editForm.other) || 0;
      const net = gross - tax - pension - other;
      if (isNaN(gross) || gross <= 0) throw new Error("Gross must be a positive number");
      if (net < 0) throw new Error("Net pay cannot be negative");

      const { error } = await (supabase as any)
        .from("payroll_entries")
        .update({ gross, deductions: { tax, pension, other }, net, notes: editForm.notes || null })
        .eq("id", editEntry.id);
      if (error) throw error;

      // Recalculate run totals
      const updatedEntries = entries.map((e) =>
        e.id === editEntry.id ? { ...e, gross, net } : e
      );
      const totalGross = updatedEntries.reduce((s, e) => s + e.gross, 0);
      const totalNet = updatedEntries.reduce((s, e) => s + e.net, 0);
      await (supabase as any)
        .from("payroll_runs")
        .update({ total_gross: totalGross, total_net: totalNet })
        .eq("id", editEntry.run_id);
    },
    onSuccess: () => {
      toast.success("Entry updated");
      qc.invalidateQueries({ queryKey: ["payroll-entries", expandedRun] });
      qc.invalidateQueries({ queryKey: ["payroll-runs"] });
      setEditEntry(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const openEditEntry = (entry: PayrollEntry) => {
    setEditForm({
      gross: String(entry.gross),
      tax: String(entry.deductions?.tax ?? 0),
      pension: String(entry.deductions?.pension ?? 0),
      other: String(entry.deductions?.other ?? 0),
      notes: entry.notes || "",
    });
    setEditEntry(entry);
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Payroll runs for all active staff with configured salaries</p>
        <Button onClick={() => setNewRunOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New run
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : runs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Banknote className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No payroll runs yet. Create your first run above.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const isExpanded = expandedRun === run.id;
            return (
              <Card key={run.id} className="overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                >
                  {isExpanded
                    ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <div className="flex-1 grid grid-cols-2 md:grid-cols-5 gap-2 items-center text-sm">
                    <div>
                      <div className="font-medium">
                        {format(new Date(run.period_start), "MMM d")} – {format(new Date(run.period_end), "MMM d, yyyy")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(run.created_at), "MMM d, yyyy")}
                      </div>
                    </div>
                    <div className="text-muted-foreground">{run.entry_count ?? 0} staff</div>
                    <div className="font-medium">{run.total_gross != null ? fmtAmount(run.total_gross) : "—"} gross</div>
                    <div className="font-medium text-green-700 dark:text-green-400">
                      {run.total_net != null ? fmtAmount(run.total_net) : "—"} net
                    </div>
                    <div>{statusBadge(run.status)}</div>
                  </div>
                  <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                    {run.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => setConfirmAction({ run, action: "approve" })}>
                        Approve
                      </Button>
                    )}
                    {run.status === "approved" && (
                      <Button size="sm" onClick={() => setConfirmAction({ run, action: "mark_paid" })}>
                        Mark paid
                      </Button>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t">
                    {entries.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground">Loading entries…</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Staff</TableHead>
                            <TableHead className="text-right">Gross</TableHead>
                            <TableHead className="text-right">Tax</TableHead>
                            <TableHead className="text-right">Pension</TableHead>
                            <TableHead className="text-right">Other</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead>Bank</TableHead>
                            {run.status === "draft" && <TableHead className="w-10" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-7 h-7">
                                    <AvatarFallback className="text-xs">
                                      {initials(entry.admin_users?.full_name, entry.admin_users?.email)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="text-sm font-medium">{entry.admin_users?.full_name || "—"}</div>
                                    <div className="text-xs text-muted-foreground">{entry.admin_users?.position || ""}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">{fmtAmount(entry.gross)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{fmtAmount(entry.deductions?.tax ?? 0)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{fmtAmount(entry.deductions?.pension ?? 0)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{fmtAmount(entry.deductions?.other ?? 0)}</TableCell>
                              <TableCell className="text-right font-medium text-green-700 dark:text-green-400">{fmtAmount(entry.net)}</TableCell>
                              <TableCell>
                                {entry.staff_bank_accounts ? (
                                  <div className="text-xs">
                                    <div>{entry.staff_bank_accounts.bank_name}</div>
                                    <div className="text-muted-foreground">···{entry.staff_bank_accounts.account_number.slice(-4)}</div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" /> No account
                                  </span>
                                )}
                              </TableCell>
                              {run.status === "draft" && (
                                <TableCell>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditEntry(entry)}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* New Run Dialog */}
      <Dialog open={newRunOpen} onOpenChange={setNewRunOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New payroll run</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period start</Label>
                <Input
                  type="date"
                  value={newRunForm.period_start}
                  onChange={(e) => setNewRunForm({ ...newRunForm, period_start: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Period end</Label>
                <Input
                  type="date"
                  value={newRunForm.period_end}
                  onChange={(e) => setNewRunForm({ ...newRunForm, period_end: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                value={newRunForm.notes}
                onChange={(e) => setNewRunForm({ ...newRunForm, notes: e.target.value })}
                placeholder="e.g. August 2026 payroll"
                rows={2}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Entries will be auto-generated from the latest salary for each active staff member.
              Deductions default to 0 — edit them per entry after creation.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRunOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createRunMutation.mutate()}
              disabled={createRunMutation.isPending || !newRunForm.period_start || !newRunForm.period_end}
            >
              {createRunMutation.isPending ? "Creating…" : "Create run"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit entry — {editEntry?.admin_users?.full_name || "Staff"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Gross pay</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.gross}
                onChange={(e) => setEditForm({ ...editForm, gross: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5">
                <Label>Tax</Label>
                <Input type="number" min="0" step="0.01" value={editForm.tax}
                  onChange={(e) => setEditForm({ ...editForm, tax: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Pension</Label>
                <Input type="number" min="0" step="0.01" value={editForm.pension}
                  onChange={(e) => setEditForm({ ...editForm, pension: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Other</Label>
                <Input type="number" min="0" step="0.01" value={editForm.other}
                  onChange={(e) => setEditForm({ ...editForm, other: e.target.value })} />
              </div>
            </div>
            {editForm.gross && (
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Net: {fmtAmount(
                  Math.max(0, parseFloat(editForm.gross || "0") - parseFloat(editForm.tax || "0") - parseFloat(editForm.pension || "0") - parseFloat(editForm.other || "0"))
                )}
              </p>
            )}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={() => updateEntryMutation.mutate()} disabled={updateEntryMutation.isPending}>
              {updateEntryMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm approve / mark paid */}
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "approve" ? "Approve payroll run?" : "Mark payroll as paid?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "approve"
                ? "This will lock the run for editing and mark it ready for payment."
                : `This will mark all ${confirmAction?.run.entry_count ?? 0} entries as paid and notify each staff member.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmAction && actionMutation.mutate(confirmAction)}
              disabled={actionMutation.isPending}
            >
              {actionMutation.isPending ? "Processing…" : confirmAction?.action === "approve" ? "Approve" : "Mark paid"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ─── SalariesTab ─────────────────────────────────────────────────────────────

const SalariesTab = () => {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    staff_id: "",
    base_amount: "",
    currency: "NGN",
    pay_schedule: "monthly",
    pay_day: "25",
    bank_account_id: "",
    effective_date: new Date().toISOString().slice(0, 10),
  });

  const { data: salaries = [], isLoading } = useQuery({
    queryKey: ["staff-salaries"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_salaries")
        .select("*, admin_users(full_name, email, position, department), staff_bank_accounts(bank_name, account_number)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffSalary[];
    },
  });

  const { data: activeStaff = [] } = useQuery({
    queryKey: ["active-staff-basic"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_users")
        .select("id, full_name, email")
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return (data || []) as ActiveStaff[];
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["bank-accounts-for-staff", form.staff_id],
    enabled: !!form.staff_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_bank_accounts")
        .select("id, bank_name, account_number, currency")
        .eq("staff_id", form.staff_id)
        .eq("verified", true);
      if (error) throw error;
      return data || [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.staff_id) throw new Error("Select a staff member");
      if (!form.base_amount || parseFloat(form.base_amount) <= 0) throw new Error("Base amount must be positive");
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("staff_salaries").insert({
        staff_id: form.staff_id,
        base_amount: parseFloat(form.base_amount),
        currency: form.currency,
        pay_schedule: form.pay_schedule,
        pay_day: parseInt(form.pay_day),
        bank_account_id: form.bank_account_id || null,
        effective_date: form.effective_date,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Salary added");
      qc.invalidateQueries({ queryKey: ["staff-salaries"] });
      qc.invalidateQueries({ queryKey: ["staff-salaries-for-run"] });
      setAddOpen(false);
      setForm({ staff_id: "", base_amount: "", currency: "NGN", pay_schedule: "monthly", pay_day: "25", bank_account_id: "", effective_date: new Date().toISOString().slice(0, 10) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Latest salary per staff (most recent effective_date)
  const latestPerStaff = new Map<string, StaffSalary>();
  for (const s of salaries) {
    const existing = latestPerStaff.get(s.staff_id);
    if (!existing || new Date(s.effective_date) > new Date(existing.effective_date)) {
      latestPerStaff.set(s.staff_id, s);
    }
  }
  const displaySalaries = Array.from(latestPerStaff.values());

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Current base salary for each active staff member</p>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add salary
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : displaySalaries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No salaries configured yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Base pay</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Pay day</TableHead>
                  <TableHead>Bank account</TableHead>
                  <TableHead>Effective</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displaySalaries.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="text-xs">
                            {initials(s.admin_users?.full_name, s.admin_users?.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">{s.admin_users?.full_name || "—"}</div>
                          <div className="text-xs text-muted-foreground">{s.admin_users?.department}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{fmtAmount(s.base_amount, s.currency)}</TableCell>
                    <TableCell className="capitalize text-sm text-muted-foreground">{s.pay_schedule}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">Day {s.pay_day}</TableCell>
                    <TableCell className="text-sm">
                      {s.staff_bank_accounts
                        ? <span>{s.staff_bank_accounts.bank_name} ···{s.staff_bank_accounts.account_number.slice(-4)}</span>
                        : <span className="text-amber-600 dark:text-amber-400 text-xs">Not set</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(s.effective_date), "MMM d, yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add salary</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Staff member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v, bank_account_id: "" })}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Base amount</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.base_amount}
                  onChange={(e) => setForm({ ...form, base_amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Pay schedule</Label>
                <Select value={form.pay_schedule} onValueChange={(v) => setForm({ ...form, pay_schedule: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PAY_SCHEDULES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pay day</Label>
                <Input type="number" min="1" max="31" value={form.pay_day}
                  onChange={(e) => setForm({ ...form, pay_day: e.target.value })} />
              </div>
            </div>
            {form.staff_id && bankAccounts.length > 0 && (
              <div className="space-y-1.5">
                <Label>Payment bank account (optional)</Label>
                <Select value={form.bank_account_id} onValueChange={(v) => setForm({ ...form, bank_account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None selected" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {bankAccounts.map((b: { id: string; bank_name: string; account_number: string; currency: string }) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bank_name} ···{b.account_number.slice(-4)} ({b.currency})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Effective date</Label>
              <Input type="date" value={form.effective_date}
                onChange={(e) => setForm({ ...form, effective_date: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Saving…" : "Add salary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ─── BankAccountsTab ─────────────────────────────────────────────────────────

const BankAccountsTab = () => {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StaffBankAccount | null>(null);
  const [form, setForm] = useState({
    staff_id: "",
    bank_name: "",
    account_number: "",
    account_name: "",
    routing_code: "",
    currency: "NGN",
    is_primary: false,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["staff-bank-accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_bank_accounts")
        .select("*, admin_users(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffBankAccount[];
    },
  });

  const { data: activeStaff = [] } = useQuery({
    queryKey: ["active-staff-basic"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_users").select("id, full_name, email").eq("status", "active").order("full_name");
      if (error) throw error;
      return (data || []) as ActiveStaff[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.staff_id || !form.bank_name || !form.account_number || !form.account_name) {
        throw new Error("Staff, bank name, account number and account name are required");
      }
      const { error } = await (supabase as any).from("staff_bank_accounts").insert({
        staff_id: form.staff_id,
        bank_name: form.bank_name,
        account_number: form.account_number,
        account_name: form.account_name,
        routing_code: form.routing_code || null,
        currency: form.currency,
        is_primary: form.is_primary,
        verified: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bank account added");
      qc.invalidateQueries({ queryKey: ["staff-bank-accounts"] });
      setAddOpen(false);
      setForm({ staff_id: "", bank_name: "", account_number: "", account_name: "", routing_code: "", currency: "NGN", is_primary: false });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const verifyMutation = useMutation({
    mutationFn: async (account: StaffBankAccount) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("staff_bank_accounts")
        .update({ verified: !account.verified, verified_by: user?.id, verified_at: new Date().toISOString() })
        .eq("id", account.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification status updated");
      qc.invalidateQueries({ queryKey: ["staff-bank-accounts"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("staff_bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account removed");
      qc.invalidateQueries({ queryKey: ["staff-bank-accounts"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">Bank accounts used for salary disbursement</p>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add account
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No bank accounts yet. Add accounts to enable payroll payments.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Primary</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((acct) => (
                  <TableRow key={acct.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback className="text-xs">
                            {initials(acct.admin_users?.full_name, acct.admin_users?.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{acct.admin_users?.full_name || acct.admin_users?.email || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{acct.bank_name}</TableCell>
                    <TableCell>
                      <div className="text-sm font-mono">{acct.account_number}</div>
                      <div className="text-xs text-muted-foreground">{acct.account_name}</div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{acct.currency}</Badge></TableCell>
                    <TableCell>{acct.is_primary ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : "—"}</TableCell>
                    <TableCell>
                      {acct.verified
                        ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1"><ShieldCheck className="w-3 h-3" />Verified</Badge>
                        : <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" />Pending</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => verifyMutation.mutate(acct)}
                          disabled={verifyMutation.isPending}
                        >
                          {acct.verified ? "Unverify" : "Verify"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(acct)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add bank account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Staff member</Label>
              <Select value={form.staff_id} onValueChange={(v) => setForm({ ...form, staff_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bank name</Label>
                <Input placeholder="e.g. GTBank" value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Account number</Label>
              <Input placeholder="0123456789" value={form.account_number}
                onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Account name</Label>
              <Input placeholder="As it appears on the account" value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Routing / sort code (optional)</Label>
              <Input placeholder="e.g. 058 for GTBank Nigeria" value={form.routing_code}
                onChange={(e) => setForm({ ...form, routing_code: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
                className="rounded"
              />
              Mark as primary account
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending}>
              {addMutation.isPending ? "Saving…" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the account for{" "}
              <strong>{deleteTarget?.admin_users?.full_name}</strong>. Any payroll entries referencing it will lose the bank reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ─── PayrollPage ─────────────────────────────────────────────────────────────

const PayrollPage = () => {
  const { data: stats } = useQuery({
    queryKey: ["payroll-stats"],
    queryFn: async () => {
      const [runsRes, salariesRes, bankRes] = await Promise.all([
        (supabase as any).from("payroll_runs").select("status, total_net, paid_at").order("paid_at", { ascending: false }),
        (supabase as any).from("staff_salaries").select("staff_id"),
        (supabase as any).from("staff_bank_accounts").select("id").eq("verified", true),
      ]);
      const runs: PayrollRun[] = runsRes.data || [];
      const lastPaid = runs.find((r) => r.status === "paid");
      const staffOnPayroll = new Set((salariesRes.data || []).map((s: { staff_id: string }) => s.staff_id)).size;
      const pendingRuns = runs.filter((r) => r.status === "draft" || r.status === "approved").length;
      return {
        staffOnPayroll,
        pendingRuns,
        lastPaidDate: lastPaid?.paid_at ? format(new Date(lastPaid.paid_at), "MMM d, yyyy") : "Never",
        verifiedBankAccounts: (bankRes.data || []).length,
      };
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="w-7 h-7 text-primary" /> Payroll
          </h1>
          <p className="text-sm text-muted-foreground">Manage staff salaries, bank accounts, and payment runs</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Staff on payroll", value: stats?.staffOnPayroll ?? "—", icon: Users, color: "text-primary", bg: "bg-primary/10" },
            { label: "Pending runs", value: stats?.pendingRuns ?? "—", icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
            { label: "Last paid", value: stats?.lastPaidDate ?? "—", icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bg: "bg-green-500/10" },
            { label: "Verified accounts", value: stats?.verifiedBankAccounts ?? "—", icon: ShieldCheck, color: "text-primary", bg: "bg-primary/10" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.bg} ${s.color}`}>
                  <s.icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</div>
                  <div className="text-2xl font-display font-bold text-foreground tabular-nums">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Payroll management</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Tabs defaultValue="runs">
              <TabsList className="mb-4">
                <TabsTrigger value="runs">Runs</TabsTrigger>
                <TabsTrigger value="salaries">Salaries</TabsTrigger>
                <TabsTrigger value="bank-accounts">Bank accounts</TabsTrigger>
              </TabsList>
              <TabsContent value="runs"><RunsTab /></TabsContent>
              <TabsContent value="salaries"><SalariesTab /></TabsContent>
              <TabsContent value="bank-accounts"><BankAccountsTab /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default PayrollPage;
