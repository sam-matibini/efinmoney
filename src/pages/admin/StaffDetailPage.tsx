import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleBadge, StaffStatusBadge } from "@/components/admin-portal/Badges";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, FileText, CheckCircle2, XCircle, ShieldOff, ShieldCheck, Mail } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { AdminRole } from "@/contexts/AdminAuthContext";

const ROLE_OPTIONS: AdminRole[] = ["super_admin", "compliance_officer", "finance_officer", "support_agent", "viewer"];

interface StaffDetail {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  department: string | null;
  role: AdminRole;
  status: string;
  document_status: string;
  id_document_type: string | null;
  id_document_url: string | null;
  rejection_reason: string | null;
  invited_at: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const StaffDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [role, setRole] = useState<AdminRole | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["admin-staff", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("id, full_name, email, phone, position, department, role, status, document_status, id_document_type, id_document_url, rejection_reason, invited_at, reviewed_at, created_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as StaffDetail | null;
    },
  });

  const review = useMutation({
    mutationFn: async (payload: { action: string; rejection_reason?: string; role?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-review-staff", {
        body: { staff_id: id, ...payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-staff", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-staff-list"] });
      toast.success("Staff record updated");
      setRejectOpen(false);
      setRejectReason("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const viewDocument = async () => {
    const { data, error } = await supabase.functions.invoke("admin-staff-doc-url", {
      body: { staff_id: id },
    });
    if (error || data?.error) {
      toast.error(data?.error || error?.message || "Could not open document");
      return;
    }
    if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-4 max-w-3xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!staff) {
    return (
      <AdminLayout>
        <div className="max-w-3xl space-y-4">
          <Button variant="ghost" onClick={() => navigate("/admin/staff")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to staff
          </Button>
          <Card><CardContent className="py-12 text-center text-muted-foreground">Staff member not found.</CardContent></Card>
        </div>
      </AdminLayout>
    );
  }

  const currentRole = role ?? staff.role;
  const isPendingReview = staff.status === "pending_review";

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <Button variant="ghost" onClick={() => navigate("/admin/staff")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to staff
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Avatar className="w-14 h-14">
              <AvatarFallback className="text-lg">{(staff.full_name || staff.email || "S").charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <CardTitle className="truncate">{staff.full_name || "No name"}</CardTitle>
              <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5" /> {staff.email || "—"}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StaffStatusBadge status={staff.status} />
              <RoleBadge role={staff.role} />
            </div>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
            <Field label="Position" value={staff.position} />
            <Field label="Department" value={staff.department} />
            <Field label="Phone" value={staff.phone} />
            <Field label="ID document type" value={staff.id_document_type?.replace(/_/g, " ")} />
            <Field label="Invited" value={staff.invited_at ? format(new Date(staff.invited_at), "MMM d, yyyy") : null} />
            <Field label="Reviewed" value={staff.reviewed_at ? format(new Date(staff.reviewed_at), "MMM d, yyyy") : null} />
          </CardContent>
        </Card>

        {/* ID document */}
        <Card>
          <CardHeader><CardTitle className="text-base">Identity document</CardTitle></CardHeader>
          <CardContent>
            {staff.id_document_url ? (
              <Button variant="outline" onClick={viewDocument} className="gap-2">
                <FileText className="w-4 h-4" /> View uploaded document
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">No document uploaded yet.</p>
            )}
            {staff.rejection_reason && staff.status === "rejected" && (
              <p className="mt-3 text-sm text-destructive">Rejection reason: {staff.rejection_reason}</p>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader><CardTitle className="text-base">Manage access</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="flex gap-2">
                <Select value={currentRole} onValueChange={(v) => setRole(v as AdminRole)}>
                  <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={currentRole === staff.role || review.isPending}
                  onClick={() => review.mutate({ action: "change_role", role: currentRole })}
                >
                  Update role
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {isPendingReview && (
                <Button
                  onClick={() => review.mutate({ action: "approve" })}
                  disabled={review.isPending}
                  className="gap-2"
                >
                  {review.isPending ? <LoadingSpinner size={16} /> : <CheckCircle2 className="w-4 h-4" />} Approve
                </Button>
              )}
              {(isPendingReview || staff.status === "invited") && (
                <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={review.isPending} className="gap-2">
                  <XCircle className="w-4 h-4" /> Reject
                </Button>
              )}
              {staff.status === "active" && (
                <Button variant="destructive" onClick={() => review.mutate({ action: "suspend" })} disabled={review.isPending} className="gap-2">
                  <ShieldOff className="w-4 h-4" /> Suspend
                </Button>
              )}
              {(staff.status === "suspended" || staff.status === "rejected") && (
                <Button onClick={() => review.mutate({ action: "reactivate" })} disabled={review.isPending} className="gap-2">
                  <ShieldCheck className="w-4 h-4" /> Reactivate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this staff application?</AlertDialogTitle>
            <AlertDialogDescription>
              The staff member will be blocked from the portal. Optionally provide a reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason (optional)"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => review.mutate({ action: "reject", rejection_reason: rejectReason })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

const Field = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
    <div className="text-foreground mt-0.5">{value || "—"}</div>
  </div>
);

export default StaffDetailPage;
