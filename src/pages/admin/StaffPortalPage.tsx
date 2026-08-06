import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleBadge, StaffStatusBadge } from "@/components/admin-portal/Badges";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  DollarSign, Banknote, CheckCircle2, Clock, Plus, Trash2,
  ShieldCheck, AlertCircle, Phone, Mail, User, Home, Users, Receipt,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Address = { street?: string; city?: string; state?: string; country?: string; postal_code?: string };
type EmergencyContact = { name?: string; relationship?: string; phone?: string };
type NextOfKin = { name?: string; relationship?: string; phone?: string; email?: string };

type OwnProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  role: string;
  status: string;
  created_at: string;
  address: Address;
  emergency_contact: EmergencyContact;
  next_of_kin: NextOfKin;
};

type OwnSalary = {
  id: string;
  base_amount: number;
  currency: string;
  pay_schedule: string;
  pay_day: number;
  effective_date: string;
};

type OwnPayslip = {
  id: string;
  gross: number;
  deductions: { tax: number; pension: number; other: number };
  net: number;
  paid_at: string | null;
  created_at: string;
  payroll_runs: { period_start: string; period_end: string; status: string } | null;
};

type OwnBankAccount = {
  id: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  routing_code: string | null;
  currency: string;
  is_primary: boolean;
  verified: boolean;
  created_at: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CURRENCIES = ["NGN", "CAD", "ZMW", "USD", "GBP"];

const fmtAmount = (n: number, currency = "NGN") =>
  new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

const initials = (name: string | null | undefined) =>
  (name || "S").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

function completionScore(profile: OwnProfile, hasBankAccount: boolean): { score: number; missing: string[] } {
  const checks: Array<[boolean, string]> = [
    [!!profile.full_name, "Full name"],
    [!!profile.phone, "Phone number"],
    [!!profile.position, "Position"],
    [!!profile.address?.street, "Home address"],
    [!!profile.emergency_contact?.name, "Emergency contact"],
    [!!profile.next_of_kin?.name, "Next of kin"],
    [hasBankAccount, "Bank account"],
  ];
  const missing = checks.filter(([ok]) => !ok).map(([, label]) => label);
  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { score, missing };
}

// ─── OverviewTab ─────────────────────────────────────────────────────────────

const OverviewTab = ({
  profile,
  salary,
  payslips,
  bankAccounts,
  onTabChange,
}: {
  profile: OwnProfile;
  salary: OwnSalary | null;
  payslips: OwnPayslip[];
  bankAccounts: OwnBankAccount[];
  onTabChange: (tab: string) => void;
}) => {
  const { score, missing } = completionScore(profile, bankAccounts.length > 0);
  const recent = payslips.slice(0, 3);
  const ytdNet = payslips.filter((p) => p.payroll_runs?.status === "paid").reduce((s, p) => s + p.net, 0);

  const nextPayDate = salary
    ? (() => {
        const today = new Date();
        const d = new Date(today.getFullYear(), today.getMonth(), salary.pay_day);
        if (d < today) d.setMonth(d.getMonth() + 1);
        return format(d, "MMM d, yyyy");
      })()
    : null;

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarFallback className="text-xl font-medium bg-primary/10 text-primary">
                {initials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-display font-bold">{profile.full_name || "No name set"}</h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <RoleBadge role={profile.role} />
                {profile.department && <Badge variant="outline">{profile.department}</Badge>}
                <StaffStatusBadge status={profile.status} />
              </div>
              <p className="text-sm text-muted-foreground mt-1">{profile.email}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => onTabChange("profile")}>
              Edit profile
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Completion */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Profile completion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Progress value={score} className="flex-1 h-2" />
            <span className="text-sm font-medium tabular-nums w-10 text-right">{score}%</span>
          </div>
          {missing.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {missing.map((m) => (
                <Badge key={m} variant="secondary" className="gap-1 text-xs">
                  <AlertCircle className="w-3 h-3" /> {m}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Base salary</div>
              <div className="font-bold tabular-nums">
                {salary ? fmtAmount(salary.base_amount, salary.currency) : "Not set"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">Next pay date</div>
              <div className="font-bold">{nextPayDate || "—"}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">YTD net pay</div>
              <div className="font-bold tabular-nums text-green-700 dark:text-green-400">
                {salary ? fmtAmount(ytdNet, salary.currency) : fmtAmount(ytdNet)}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent payslips */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-medium">Recent payslips</CardTitle>
          {payslips.length > 3 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => onTabChange("payslips")}>
              View all
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="px-6 pb-6 text-center text-sm text-muted-foreground">No payslips yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.payroll_runs
                        ? `${format(new Date(p.payroll_runs.period_start), "MMM d")} – ${format(new Date(p.payroll_runs.period_end), "MMM d, yyyy")}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtAmount(p.gross)}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-green-700 dark:text-green-400">
                      {fmtAmount(p.net)}
                    </TableCell>
                    <TableCell>
                      {p.payroll_runs?.status === "paid"
                        ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Paid</Badge>
                        : <Badge variant="secondary">Pending</Badge>}
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
};

// ─── ProfileTab ──────────────────────────────────────────────────────────────

const ProfileTab = ({ profile, onSaved }: { profile: OwnProfile; onSaved: () => void }) => {
  const [form, setForm] = useState({
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    position: profile.position || "",
  });
  const [address, setAddress] = useState<Address>(profile.address || {});
  const [emergency, setEmergency] = useState<EmergencyContact>(profile.emergency_contact || {});
  const [kin, setKin] = useState<NextOfKin>(profile.next_of_kin || {});

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("admin_users")
        .update({
          full_name: form.full_name.trim() || null,
          phone: form.phone.trim() || null,
          position: form.position.trim() || null,
          address,
          emergency_contact: emergency,
          next_of_kin: kin,
        })
        .eq("id", profile.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile updated");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const Field = ({
    label, value, onChange, placeholder, type = "text",
  }: {
    label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
  }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Read-only info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <User className="w-4 h-4" /> Account info
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2">
            <div>
              <span className="text-muted-foreground">Email</span>
              <div className="font-medium mt-0.5">{profile.email || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Role</span>
              <div className="mt-0.5"><RoleBadge role={profile.role} /></div>
            </div>
            <div>
              <span className="text-muted-foreground">Department</span>
              <div className="font-medium mt-0.5">{profile.department || "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Member since</span>
              <div className="font-medium mt-0.5">{format(new Date(profile.created_at), "MMM d, yyyy")}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Email, role, and department are managed by your administrator.</p>
        </CardContent>
      </Card>

      {/* Editable basics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Phone className="w-4 h-4" /> Contact details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} placeholder="Your full name" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+1 555 000 0000" type="tel" />
            <Field label="Position / job title" value={form.position} onChange={(v) => setForm({ ...form, position: v })} placeholder="e.g. Compliance Analyst" />
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Home className="w-4 h-4" /> Home address
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Street" value={address.street || ""} onChange={(v) => setAddress({ ...address, street: v })} placeholder="123 Main St" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="City" value={address.city || ""} onChange={(v) => setAddress({ ...address, city: v })} placeholder="Lagos" />
            <Field label="State / province" value={address.state || ""} onChange={(v) => setAddress({ ...address, state: v })} placeholder="Lagos State" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country" value={address.country || ""} onChange={(v) => setAddress({ ...address, country: v })} placeholder="Nigeria" />
            <Field label="Postal code" value={address.postal_code || ""} onChange={(v) => setAddress({ ...address, postal_code: v })} placeholder="100001" />
          </div>
        </CardContent>
      </Card>

      {/* Emergency contact */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" /> Emergency contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={emergency.name || ""} onChange={(v) => setEmergency({ ...emergency, name: v })} placeholder="Jane Doe" />
            <Field label="Relationship" value={emergency.relationship || ""} onChange={(v) => setEmergency({ ...emergency, relationship: v })} placeholder="Spouse" />
          </div>
          <Field label="Phone" value={emergency.phone || ""} onChange={(v) => setEmergency({ ...emergency, phone: v })} placeholder="+1 555 000 0001" type="tel" />
        </CardContent>
      </Card>

      {/* Next of kin */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" /> Next of kin
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name" value={kin.name || ""} onChange={(v) => setKin({ ...kin, name: v })} placeholder="John Doe" />
            <Field label="Relationship" value={kin.relationship || ""} onChange={(v) => setKin({ ...kin, relationship: v })} placeholder="Parent" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Phone" value={kin.phone || ""} onChange={(v) => setKin({ ...kin, phone: v })} placeholder="+1 555 000 0002" type="tel" />
            <Field label="Email" value={kin.email || ""} onChange={(v) => setKin({ ...kin, email: v })} placeholder="nextofkin@email.com" type="email" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="min-w-32">
          {saveMutation.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  );
};

// ─── BankAccountsTab ─────────────────────────────────────────────────────────

const BankAccountsTab = ({ staffId }: { staffId: string }) => {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OwnBankAccount | null>(null);
  const [form, setForm] = useState({
    bank_name: "",
    account_number: "",
    account_name: "",
    routing_code: "",
    currency: "NGN",
    is_primary: false,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["own-bank-accounts", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_bank_accounts")
        .select("*")
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OwnBankAccount[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.bank_name || !form.account_number || !form.account_name) {
        throw new Error("Bank name, account number, and account name are required");
      }
      const { error } = await (supabase as any).from("staff_bank_accounts").insert({
        staff_id: staffId,
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
      toast.success("Bank account added — your finance team will verify it before the next payroll run");
      qc.invalidateQueries({ queryKey: ["own-bank-accounts", staffId] });
      setAddOpen(false);
      setForm({ bank_name: "", account_number: "", account_name: "", routing_code: "", currency: "NGN", is_primary: false });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("staff_bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Account removed");
      qc.invalidateQueries({ queryKey: ["own-bank-accounts", staffId] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Add your bank accounts for salary payment. Your finance team verifies them before use.
        </p>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Add account
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Banknote className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No bank accounts yet. Add one to receive salary payments.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acct) => (
            <Card key={acct.id}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{acct.bank_name}</span>
                    <Badge variant="secondary">{acct.currency}</Badge>
                    {acct.is_primary && <Badge variant="outline">Primary</Badge>}
                    {acct.verified
                      ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 gap-1 text-xs"><ShieldCheck className="w-3 h-3" />Verified</Badge>
                      : <Badge variant="secondary" className="gap-1 text-xs"><Clock className="w-3 h-3" />Pending verification</Badge>}
                  </div>
                  <div className="text-sm font-mono mt-0.5">{acct.account_number}</div>
                  <div className="text-xs text-muted-foreground">{acct.account_name}</div>
                </div>
                {!acct.verified && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => setDeleteTarget(acct)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground px-1">
            Verified accounts cannot be removed. Contact your finance team if you need to update one.
          </p>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add bank account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
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
              <Input placeholder="e.g. 058 for GTBank" value={form.routing_code}
                onChange={(e) => setForm({ ...form, routing_code: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_primary}
                onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} className="rounded" />
              Mark as my primary account
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

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove bank account?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleteTarget?.bank_name} account ending in ···{deleteTarget?.account_number.slice(-4)}?
              This cannot be undone.
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

// ─── PayslipsTab ─────────────────────────────────────────────────────────────

const PayslipsTab = ({ staffId, currency }: { staffId: string; currency: string }) => {
  const { data: payslips = [], isLoading } = useQuery({
    queryKey: ["own-payslips", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payroll_entries")
        .select("*, payroll_runs(period_start, period_end, status, paid_at)")
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OwnPayslip[];
    },
  });

  const ytdGross = payslips.filter((p) => p.payroll_runs?.status === "paid").reduce((s, p) => s + p.gross, 0);
  const ytdTax = payslips.filter((p) => p.payroll_runs?.status === "paid").reduce((s, p) => s + (p.deductions?.tax ?? 0), 0);
  const ytdNet = payslips.filter((p) => p.payroll_runs?.status === "paid").reduce((s, p) => s + p.net, 0);

  return (
    <div className="space-y-4">
      {/* YTD summary */}
      {payslips.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "YTD gross", value: fmtAmount(ytdGross, currency), color: "" },
            { label: "YTD tax", value: fmtAmount(ytdTax, currency), color: "text-muted-foreground" },
            { label: "YTD net", value: fmtAmount(ytdNet, currency), color: "text-green-700 dark:text-green-400" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</div>
                <div className={`text-lg font-bold tabular-nums mt-1 ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : payslips.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No payslips yet. They'll appear here after each payroll run.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Pension</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.payroll_runs
                        ? `${format(new Date(p.payroll_runs.period_start), "MMM d")} – ${format(new Date(p.payroll_runs.period_end), "MMM d, yyyy")}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">{fmtAmount(p.gross, currency)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmtAmount(p.deductions?.tax ?? 0, currency)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmtAmount(p.deductions?.pension ?? 0, currency)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{fmtAmount(p.deductions?.other ?? 0, currency)}</TableCell>
                    <TableCell className="text-right text-sm font-medium text-green-700 dark:text-green-400">
                      {fmtAmount(p.net, currency)}
                    </TableCell>
                    <TableCell>
                      {p.payroll_runs?.status === "paid"
                        ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Paid</Badge>
                        : p.payroll_runs?.status === "approved"
                          ? <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Approved</Badge>
                          : <Badge variant="secondary">Draft</Badge>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.paid_at ? format(new Date(p.paid_at), "MMM d, yyyy") : "—"}
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
};

// ─── StaffPortalPage ─────────────────────────────────────────────────────────

const StaffPortalPage = () => {
  const { admin } = useAdminAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["own-profile", admin?.id],
    enabled: !!admin?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("admin_users")
        .select("id, full_name, email, phone, position, department, role, status, created_at, address, emergency_contact, next_of_kin")
        .eq("id", admin!.id)
        .maybeSingle();
      if (error) throw error;
      return data as OwnProfile;
    },
  });

  const { data: salary } = useQuery({
    queryKey: ["own-salary", admin?.id],
    enabled: !!admin?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_salaries")
        .select("id, base_amount, currency, pay_schedule, pay_day, effective_date")
        .eq("staff_id", admin!.id)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as OwnSalary | null;
    },
  });

  const { data: payslips = [] } = useQuery({
    queryKey: ["own-payslips-overview", admin?.id],
    enabled: !!admin?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payroll_entries")
        .select("id, gross, deductions, net, paid_at, created_at, payroll_runs(period_start, period_end, status)")
        .eq("staff_id", admin!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OwnPayslip[];
    },
  });

  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["own-bank-accounts-overview", admin?.id],
    enabled: !!admin?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_bank_accounts")
        .select("id")
        .eq("staff_id", admin!.id);
      if (error) throw error;
      return data || [];
    },
  });

  if (profileLoading || !profile) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
            <User className="w-7 h-7 text-primary" /> My portal
          </h1>
          <p className="text-sm text-muted-foreground">Your profile, payslips, and bank accounts</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="bank-accounts">Bank accounts</TabsTrigger>
            <TabsTrigger value="payslips">Payslips</TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="overview">
              <OverviewTab
                profile={profile}
                salary={salary ?? null}
                payslips={payslips}
                bankAccounts={bankAccounts}
                onTabChange={setActiveTab}
              />
            </TabsContent>

            <TabsContent value="profile">
              <ProfileTab
                profile={profile}
                onSaved={() => qc.invalidateQueries({ queryKey: ["own-profile", admin?.id] })}
              />
            </TabsContent>

            <TabsContent value="bank-accounts">
              <BankAccountsTab staffId={profile.id} />
            </TabsContent>

            <TabsContent value="payslips">
              <PayslipsTab staffId={profile.id} currency={salary?.currency || "NGN"} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default StaffPortalPage;
