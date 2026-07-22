import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { ArrowLeft, Check, X, FileText, AlertTriangle } from "lucide-react";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { KybStatusBadge } from "@/pages/admin/KybQueuePage";
import { UBO_THRESHOLD_PERCENT } from "@/hooks/useKyb";

const db = supabase as unknown as { from: (t: string) => any };
const BUCKET = "business-documents";

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm border-b last:border-0">
    <span className="text-muted-foreground flex-shrink-0">{label}</span>
    <span className="text-right break-words">{value || "—"}</span>
  </div>
);

const KybReviewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-kyb", id],
    enabled: !!id,
    queryFn: async () => {
      const [b, o, d, a] = await Promise.all([
        db.from("business_profiles").select("*").eq("id", id).maybeSingle(),
        db
          .from("business_owners")
          .select("*")
          .eq("business_profile_id", id)
          .order("ownership_percent", { ascending: false }),
        db
          .from("business_documents")
          .select("*")
          .eq("business_profile_id", id)
          .order("uploaded_at", { ascending: false }),
        db
          .from("business_kyb_audit_log")
          .select("*")
          .eq("business_profile_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (b.error) throw b.error;
      return {
        business: b.data,
        owners: (o.data || []) as any[],
        documents: (d.data || []) as any[],
        audit: (a.data || []) as any[],
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-kyb", id] });

  const reviewDoc = useMutation({
    mutationFn: async ({
      docId,
      status,
      reason,
    }: {
      docId: string;
      status: "approved" | "rejected";
      reason?: string;
    }) => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await db
        .from("business_documents")
        .update({
          status,
          rejection_reason: reason ?? null,
          reviewed_by: session.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", docId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message || "Could not update document."),
  });

  const decide = useMutation({
    mutationFn: async (status: "approved" | "rejected" | "suspended") => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await db
        .from("business_profiles")
        .update({
          kyb_status: status,
          rejection_reason: status === "approved" ? null : note.trim() || null,
          reviewed_by: session.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, status) => {
      toast.success(`Business ${status}.`);
      setNote("");
      invalidate();
    },
    // The trigger raises check_violation when required docs aren't all approved.
    onError: (e: any) => toast.error(e?.message || "Could not record the decision."),
  });

  const openDoc = async (path: string) => {
    const { data: signed, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !signed) return toast.error("Could not open the document.");
    window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <Skeleton className="h-96 w-full" />
      </AdminLayout>
    );
  }

  const b = data?.business;
  if (!b) {
    return (
      <AdminLayout>
        <p className="text-sm text-muted-foreground">Business not found.</p>
      </AdminLayout>
    );
  }

  const owners = data!.owners;
  const documents = data!.documents;
  const ownershipTotal = owners
    .filter((o) => o.role === "beneficial_owner")
    .reduce((s, o) => s + Number(o.ownership_percent || 0), 0);

  const ownerName = (ownerId: string | null) =>
    ownerId ? owners.find((o) => o.id === ownerId)?.full_name : null;

  const decided = ["approved", "rejected", "suspended"].includes(b.kyb_status);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/kyb")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Queue
          </Button>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">{b.legal_name}</h1>
            <p className="text-sm text-muted-foreground">
              {b.entity_type?.replace(/_/g, " ")} · {b.incorporation_country}
            </p>
          </div>
          <KybStatusBadge status={b.kyb_status} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Business details</CardTitle>
            </CardHeader>
            <CardContent>
              <Row label="Operating name" value={b.operating_name} />
              <Row label="Registration number" value={b.registration_number} />
              <Row label="Tax ID" value={b.tax_id} />
              <Row label="Incorporated" value={b.date_of_incorporation} />
              <Row label="Region" value={b.incorporation_region} />
              <Row label="Industry" value={b.industry} />
              <Row label="Website" value={b.website} />
              <Row label="Email" value={b.business_email} />
              <Row label="Phone" value={b.business_phone} />
              <Row
                label="Expected monthly volume"
                value={
                  b.expected_monthly_volume === null
                    ? null
                    : Number(b.expected_monthly_volume).toLocaleString()
                }
              />
              <Row label="Source of funds" value={b.source_of_funds} />
              <Row
                label="Registered address"
                value={[b.street_address, b.city, b.state_province, b.postal_code]
                  .filter(Boolean)
                  .join(", ")}
              />
              <Row
                label="Submitted"
                value={b.submitted_at ? format(new Date(b.submitted_at), "PPp") : null}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Ownership &amp; control</CardTitle>
              <Badge variant={ownershipTotal > 100 ? "destructive" : "secondary"}>
                {ownershipTotal.toFixed(2)}%
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {ownershipTotal > 100 && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  Declared ownership exceeds 100%.
                </div>
              )}
              {owners.length === 0 && (
                <p className="text-sm text-muted-foreground">No owners declared.</p>
              )}
              {owners.map((o) => (
                <div key={o.id} className="rounded-lg border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{o.full_name}</span>
                    <div className="flex items-center gap-1.5">
                      {o.is_pep && (
                        <Badge variant="destructive" className="text-[10px]">
                          PEP
                        </Badge>
                      )}
                      {o.role === "beneficial_owner" &&
                        Number(o.ownership_percent) >= UBO_THRESHOLD_PERCENT && (
                          <Badge variant="secondary" className="text-[10px]">
                            UBO
                          </Badge>
                        )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {o.role.replace(/_/g, " ")}
                    {o.role === "beneficial_owner" &&
                      ` · ${Number(o.ownership_percent).toFixed(2)}%`}
                    {o.date_of_birth && ` · DOB ${o.date_of_birth}`}
                    {o.nationality && ` · ${o.nationality}`}
                  </p>
                  {(o.street_address || o.city) && (
                    <p className="text-xs text-muted-foreground">
                      {[o.street_address, o.city, o.state_province, o.postal_code]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            )}
            {documents.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-lg border p-3 flex-wrap"
              >
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">
                    {d.document_type.replace(/_/g, " ")}
                    {ownerName(d.business_owner_id) && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        — {ownerName(d.business_owner_id)}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{d.file_name}</p>
                  {d.status === "rejected" && d.rejection_reason && (
                    <p className="text-xs text-destructive">{d.rejection_reason}</p>
                  )}
                </div>
                <Badge
                  variant={
                    d.status === "approved"
                      ? "secondary"
                      : d.status === "rejected"
                        ? "destructive"
                        : "outline"
                  }
                  className="capitalize"
                >
                  {d.status}
                </Badge>
                <Button size="sm" variant="outline" onClick={() => openDoc(d.file_path)}>
                  View
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={reviewDoc.isPending}
                  onClick={() => reviewDoc.mutate({ docId: d.id, status: "approved" })}
                >
                  <Check className="w-4 h-4 text-emerald-600" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={reviewDoc.isPending}
                  onClick={() => {
                    const reason = window.prompt("Why is this document rejected?");
                    if (reason === null) return;
                    reviewDoc.mutate({ docId: d.id, status: "rejected", reason });
                  }}
                >
                  <X className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason (required when rejecting or suspending — shown to the applicant)"
              rows={3}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={decide.isPending}
                onClick={() => decide.mutate("approved")}
              >
                <Check className="w-4 h-4 mr-1" /> Approve business
              </Button>
              <Button
                variant="destructive"
                disabled={decide.isPending || !note.trim()}
                onClick={() => decide.mutate("rejected")}
              >
                <X className="w-4 h-4 mr-1" /> Reject
              </Button>
              {decided && b.kyb_status === "approved" && (
                <Button
                  variant="outline"
                  disabled={decide.isPending || !note.trim()}
                  onClick={() => decide.mutate("suspended")}
                >
                  Suspend
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Approval is blocked until every required business document is marked approved.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit trail</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data!.audit.length === 0 && (
              <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
            )}
            {data!.audit.map((a) => (
              <div key={a.id} className="text-sm flex justify-between gap-4 border-b pb-1.5">
                <span>
                  {a.previous_status || "—"} → <span className="font-medium">{a.new_status}</span>
                  {a.notes && <span className="text-muted-foreground"> · {a.notes}</span>}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {format(new Date(a.created_at), "PPp")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default KybReviewPage;
