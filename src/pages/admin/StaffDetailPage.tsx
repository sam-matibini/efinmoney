import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { RoleBadge, StaffStatusBadge } from "@/components/admin-portal/Badges";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, FileText, CheckCircle2, XCircle, ShieldOff, ShieldCheck, Mail,
  Clock, Eye, Trash2, Upload, Plus,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { AdminRole } from "@/contexts/AdminAuthContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

const ROLE_OPTIONS: AdminRole[] = ["super_admin", "compliance_officer", "finance_officer", "support_agent", "viewer"];

const DOC_TYPES = [
  { value: "id_front",      label: "ID – front" },
  { value: "id_back",       label: "ID – back" },
  { value: "offer_letter",  label: "Offer letter" },
  { value: "contract",      label: "Employment contract" },
  { value: "nda",           label: "NDA" },
  { value: "tax_form",      label: "Tax form" },
  { value: "certification", label: "Certification" },
  { value: "bank_letter",   label: "Bank letter" },
  { value: "other",         label: "Other" },
];
const DOC_TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label]));

interface StaffDocument {
  id: string;
  staff_id: string;
  doc_type: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  status: "pending" | "verified" | "expired";
  expires_at: string | null;
  notes: string | null;
  uploaded_by: string | null;
  verified_at: string | null;
  created_at: string;
}

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

// ─── StaffDocumentsCard ───────────────────────────────────────────────────────

const StaffDocumentsCard = ({ staffId }: { staffId: string }) => {
  const { admin } = useAdminAuth();
  const qc = useQueryClient();
  const canModify = admin?.role === "super_admin" || admin?.role === "compliance_officer";
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ doc_type: "id_front", file: null as File | null });
  const [deleteTarget, setDeleteTarget] = useState<StaffDocument | null>(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["staff-documents", staffId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_documents")
        .select("*")
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StaffDocument[];
    },
  });

  const viewDoc = async (doc: StaffDocument) => {
    const { data, error } = await supabase.storage
      .from("staff-documents")
      .createSignedUrl(doc.storage_path, 3600);
    if (error || !data?.signedUrl) { toast.error("Could not generate link"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const file = uploadForm.file;
      if (!file) throw new Error("No file selected");
      const ext = file.name.split(".").pop();
      const path = `staff/${staffId}/${Date.now()}-${uploadForm.doc_type}.${ext}`;
      const { error: storageErr } = await supabase.storage
        .from("staff-documents")
        .upload(path, file, { contentType: file.type });
      if (storageErr) throw storageErr;
      const { error: dbErr } = await (supabase as any).from("staff_documents").insert({
        staff_id: staffId,
        doc_type: uploadForm.doc_type,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        uploaded_by: admin!.id,
        status: "pending",
      });
      if (dbErr) {
        await supabase.storage.from("staff-documents").remove([path]);
        throw dbErr;
      }
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["staff-documents", staffId] });
      setUploadOpen(false);
      setUploadForm({ doc_type: "id_front", file: null });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const verifyMutation = useMutation({
    mutationFn: async (doc: StaffDocument) => {
      const { error } = await (supabase as any)
        .from("staff_documents")
        .update({ status: "verified", verified_by: admin!.id, verified_at: new Date().toISOString() })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document verified");
      qc.invalidateQueries({ queryKey: ["staff-documents", staffId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const expireMutation = useMutation({
    mutationFn: async (doc: StaffDocument) => {
      const { error } = await (supabase as any)
        .from("staff_documents")
        .update({ status: "expired" })
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document marked expired");
      qc.invalidateQueries({ queryKey: ["staff-documents", staffId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (doc: StaffDocument) => {
      await supabase.storage.from("staff-documents").remove([doc.storage_path]);
      const { error } = await (supabase as any)
        .from("staff_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["staff-documents", staffId] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "verified")
      return <Badge className="gap-1 text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="w-3 h-3" />Verified</Badge>;
    if (status === "expired")
      return <Badge variant="destructive" className="gap-1 text-xs"><XCircle className="w-3 h-3" />Expired</Badge>;
    return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="w-3 h-3" />Pending</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Document vault
          </CardTitle>
          {canModify && (
            <Button size="sm" variant="outline" className="gap-2" onClick={() => setUploadOpen(true)}>
              <Plus className="w-3.5 h-3.5" /> Upload
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : docs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <FileText className="w-7 h-7 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-6 py-3">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}</div>
                    <div className="text-xs text-muted-foreground truncate">{doc.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(doc.created_at), "MMM d, yyyy")}
                    </div>
                  </div>
                  <StatusBadge status={doc.status} />
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="View"
                      onClick={() => viewDoc(doc)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {canModify && doc.status === "pending" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600 hover:text-green-700"
                        title="Verify" onClick={() => verifyMutation.mutate(doc)}
                        disabled={verifyMutation.isPending}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canModify && doc.status === "verified" && (
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:text-amber-700"
                        title="Mark expired" onClick={() => expireMutation.mutate(doc)}
                        disabled={expireMutation.isPending}>
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canModify && (
                      <Button size="icon" variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Delete" onClick={() => setDeleteTarget(doc)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={uploadForm.doc_type}
                onValueChange={(v) => setUploadForm({ ...uploadForm, doc_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>File (PDF, JPG, PNG — max 10 MB)</Label>
              <Input
                type="file"
                ref={fileRef}
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] ?? null })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={() => uploadMutation.mutate()}
              disabled={!uploadForm.file || uploadMutation.isPending}
              className="gap-2">
              {uploadMutation.isPending
                ? <><LoadingSpinner size={14} /> Uploading…</>
                : <><Upload className="w-4 h-4" /> Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently delete <strong>{deleteTarget?.file_name}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

// ─── StaffDetailPage ──────────────────────────────────────────────────────────

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

        {/* Document vault */}
        <StaffDocumentsCard staffId={staff.id} />

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
