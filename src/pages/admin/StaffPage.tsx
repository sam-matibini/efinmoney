import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RoleBadge, StaffStatusBadge } from "@/components/admin-portal/Badges";
import InviteStaffModal from "@/components/admin-portal/InviteStaffModal";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Search, UserPlus, Users as UsersIcon, UserCheck, Clock, ShieldX, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

const ROLES = ["super_admin", "compliance_officer", "finance_officer", "support_agent", "viewer"];
const STATUSES = ["active", "invited", "pending_review", "suspended", "rejected"];

interface StaffRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  department: string | null;
  position: string | null;
  created_at: string;
  invited_at: string | null;
}

const StaffPage = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAdminAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", role: "", status: "", department: "", position: "" });
  const canManage = hasPermission("manage_staff");

  const updateMutation = useMutation({
    mutationFn: async (fields: typeof editForm) => {
      const { error } = await supabase.from("admin_users").update(fields as any).eq("id", editTarget!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff updated");
      qc.invalidateQueries({ queryKey: ["admin-staff-list"] });
      setEditTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admin_users").delete().eq("id", deleteTarget!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Staff removed");
      qc.invalidateQueries({ queryKey: ["admin-staff-list"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const openEdit = (s: StaffRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditForm({ full_name: s.full_name || "", role: s.role, status: s.status, department: s.department || "", position: s.position || "" });
    setEditTarget(s);
  };

  const openDelete = (s: StaffRow, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(s);
  };

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["admin-staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, full_name, email, role, status, department, position, created_at, invited_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffRow[];
    },
  });

  const filtered = staff.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.role.toLowerCase().includes(q) ||
      s.department?.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: staff.length,
    active: staff.filter((s) => s.status === "active").length,
    pending: staff.filter((s) => s.status === "invited" || s.status === "pending_review").length,
    blocked: staff.filter((s) => s.status === "rejected" || s.status === "suspended").length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight flex items-center gap-2">
              <UsersIcon className="w-7 h-7 text-primary" /> Staff
            </h1>
            <p className="text-sm text-muted-foreground">Invite team members and manage roles &amp; access</p>
          </div>
          {canManage && (
            <Button onClick={() => setInviteOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" /> Invite staff
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total", value: stats.total, icon: UsersIcon, color: "text-primary", bg: "bg-primary/10" },
            { label: "Active", value: stats.active, icon: UserCheck, color: "text-primary", bg: "bg-primary/10" },
            { label: "Onboarding", value: stats.pending, icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
            { label: "Blocked", value: stats.blocked, icon: ShieldX, color: "text-destructive", bg: "bg-destructive/10" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.bg} ${s.color}`}>
                  <s.icon className="w-6 h-6" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{s.label}</div>
                  <div className="text-3xl font-display font-bold text-foreground tabular-nums">{s.value}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-base">All staff ({filtered.length})</CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, role, department"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Joined</TableHead>
                      {canManage && <TableHead className="w-24 text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canManage ? 6 : 5} className="text-center py-10 text-muted-foreground">
                          {query ? "No staff match your search" : "No staff yet"}
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((s) => (
                      <TableRow
                        key={s.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/admin/staff/${s.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarFallback>{(s.full_name || s.email || "S").charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="font-medium truncate">{s.full_name || "No name"}</div>
                              <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell><RoleBadge role={s.role} /></TableCell>
                        <TableCell><StaffStatusBadge status={s.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.department || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(s.created_at), "MMM d, yyyy")}
                        </TableCell>
                        {canManage && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={(e) => openEdit(s, e)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => openDelete(s, e)}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <InviteStaffModal open={inviteOpen} onOpenChange={setInviteOpen} />

      {/* Edit modal */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit staff — {editTarget?.full_name || editTarget?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} placeholder="e.g. Compliance" />
              </div>
              <div className="space-y-1.5">
                <Label>Position</Label>
                <Input value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} placeholder="e.g. Manager" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove staff member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.full_name || deleteTarget?.email}</strong> from the admin team. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default StaffPage;
