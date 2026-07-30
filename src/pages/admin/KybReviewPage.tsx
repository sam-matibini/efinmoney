import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Check, X, FileText, AlertTriangle, Upload, Send } from "lucide-react";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { KybStatusBadge } from "@/pages/admin/KybQueuePage";
import { UBO_THRESHOLD_PERCENT } from "@/hooks/useKyb";
import { kybAudit, listKybMessages, postKybMessage, type KybMessage } from "@/lib/kybAdmin";
import type { BusinessOwner } from "@/hooks/useKyb";

const DOC_TYPES = [
  { value: "registration_certificate", label: "Certificate of incorporation" },
  { value: "articles_of_incorporation", label: "Articles of incorporation" },
  { value: "proof_of_business_address", label: "Proof of business address" },
  { value: "ownership_chart", label: "Ownership / control structure" },
  { value: "bank_statement", label: "Business bank statement" },
  { value: "business_name_registration", label: "Business name registration" },
  { value: "cac_status_report", label: "CAC status report" },
  { value: "tin_certificate", label: "TIN certificate" },
  { value: "owner_government_id", label: "Owner government ID" },
  { value: "owner_bvn", label: "Owner BVN" },
  { value: "owner_proof_of_address", label: "Owner proof of address" },
  { value: "other", label: "Other" },
];

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
  const [rejectTarget, setRejectTarget] = useState<{ id: string; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState("other");
  const [uploadOwnerId, setUploadOwnerId] = useState<string>("");
  const [newMessage, setNewMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-kyb", id],
    enabled: !!id,
    queryFn: async () => {
      const [b, o, d, a, s, m] = await Promise.all([
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
        db
          .from("aml_screenings")
          .select("*")
          .eq("trigger", "kyb")
          .eq("trigger_ref", id)
          .order("match_count", { ascending: false }),
        listKybMessages(id!),
      ]);
      if (b.error) throw b.error;
      const reviewerId = b.data?.reviewed_by as string | null | undefined;
      const reviewerName = reviewerId
        ? (
            await db
              .from("profiles")
              .select("user_id, full_name")
              .eq("user_id", reviewerId)
              .maybeSingle()
          ).data?.full_name ?? null
        : null;
      return {
        business: b.data,
        owners: (o.data || []) as any[],
        documents: (d.data || []) as any[],
        audit: (a.data || []) as any[],
        screenings: (s.data || []) as any[],
        messages: m as KybMessage[],
        reviewerName: reviewerName as string | null,
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-kyb", id] });

  const uploadOnBehalf = useMutation({
    mutationFn: async () => {
      if (!id || !data?.business) throw new Error("Missing business.");
      if (!uploadFile) throw new Error("Choose a file to upload.");
      const ts = Date.now();
      const ext = uploadFile.name.includes(".")
        ? uploadFile.name.split(".").pop()
        : "bin";
      const safeType = uploadType.replace(/[^a-z0-9_]/gi, "_");
      const path = `${data.business.owner_user_id}/${id}/${safeType}-${ts}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, uploadFile, { contentType: uploadFile.type || undefined, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await db.from("business_documents").insert({
        business_profile_id: id,
        business_owner_id: uploadOwnerId || null,
        document_type: uploadType,
        file_name: uploadFile.name,
        file_path: path,
        file_size: uploadFile.size,
        mime_type: uploadFile.type || null,
        status: "pending",
      });
      if (insErr) throw insErr;
      await kybAudit(id, "doc_uploaded_by_admin", `${uploadType} uploaded on behalf of applicant.`);
    },
    onSuccess: () => {
      toast.success("Document uploaded. Awaiting review.");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadType("other");
      setUploadOwnerId("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Upload failed."),
  });

  const sendMessage = useMutation({
    mutationFn: async (body: string) => {
      if (!id) throw new Error("Missing business.");
      await postKybMessage(id, body, "admin");
    },
    onSuccess: () => {
      setNewMessage("");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Could not send the message."),
  });

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

  // Stamping screened_by is what marks a hit resolved — the approval trigger
  // counts hits with screened_by IS NULL and refuses while any remain.
  const clearHit = useMutation({
    mutationFn: async ({ screeningId, isFalsePositive }: { screeningId: string; isFalsePositive: boolean }) => {
      const { data: session } = await supabase.auth.getUser();
      const { error } = await db
        .from("aml_screenings")
        .update({
          screened_by: session.user?.id ?? null,
          screened_at: new Date().toISOString(),
          status: isFalsePositive ? "clear" : "hit",
        })
        .eq("id", screeningId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message || "Could not update the screening."),
  });

  const reviewOwner = useMutation({
    mutationFn: async ({ ownerId, status }: { ownerId: string; status: "approved" | "rejected" }) => {
      const { error } = await db
        .from("business_owners")
        .update({ verification_status: status })
        .eq("id", ownerId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message || "Could not update the owner."),
  });

  const rescreen = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).rpc("screen_kyb_entity", {
        p_business_profile_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Re-screened against the current watchlist.");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || "Could not re-screen."),
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
      return status;
    },
    onSuccess: (_r, status) => {
      toast.success(`Business ${status}.`);
      setNote("");
      invalidate();
      // Best-effort confirmation email to the business contact
      if (status === "approved" && b?.business_email) {
        supabase.functions
          .invoke("send-email", {
            body: {
              type: "kyb_update",
              to: b.business_email,
              data: {
                legal_name: b.legal_name,
                status: "approved",
                app_url: window.location.origin,
              },
            },
          })
          .catch(() => { /* non-blocking */ });
      }
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

  const screenings = data!.screenings;
  const unresolvedHits = screenings.filter((s) => s.status === "hit" && !s.screened_by);
  const pepsPendingSignoff = owners.filter(
    (o) => o.is_pep && o.verification_status !== "approved"
  );
  const blockers = unresolvedHits.length + pepsPendingSignoff.length;

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
              {b.reviewed_at && data?.reviewerName && (
                <>
                  {" "}· reviewed by {data.reviewerName}{" "}
                  {formatDistanceToNow(new Date(b.reviewed_at), { addSuffix: true })}
                </>
              )}
              {b.reviewed_at && !data?.reviewerName && (
                <>
                  {" "}· reviewed {formatDistanceToNow(new Date(b.reviewed_at), { addSuffix: true })}
                </>
              )}
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

        <Card className={unresolvedHits.length > 0 ? "border-destructive/50" : undefined}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              Sanctions &amp; PEP screening
              {b.aml_last_screened_at && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  last run {format(new Date(b.aml_last_screened_at), "PPp")}
                </span>
              )}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={rescreen.isPending}
              onClick={() => rescreen.mutate()}
            >
              {rescreen.isPending ? "Screening..." : "Re-screen"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {screenings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Not screened yet — screening runs automatically on submission.
              </p>
            )}
            {screenings.map((s) => {
              const isHit = s.status === "hit";
              const resolved = Boolean(s.screened_by);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-lg border p-3 flex-wrap"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.subject_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {isHit ? `${s.match_count} watchlist match(es)` : "No match"}
                      {s.subject_country && ` · ${s.subject_country}`}
                      {resolved && " · reviewed"}
                    </p>
                  </div>
                  <Badge
                    variant={isHit && !resolved ? "destructive" : isHit ? "outline" : "secondary"}
                  >
                    {isHit ? (resolved ? "hit — reviewed" : "hit") : "clear"}
                  </Badge>
                  {isHit && !resolved && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={clearHit.isPending}
                        onClick={() =>
                          clearHit.mutate({ screeningId: s.id, isFalsePositive: true })
                        }
                      >
                        False positive
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={clearHit.isPending}
                        onClick={() =>
                          clearHit.mutate({ screeningId: s.id, isFalsePositive: false })
                        }
                      >
                        Confirmed — reviewed
                      </Button>
                    </>
                  )}
                </div>
              );
            })}

            {pepsPendingSignoff.length > 0 && (
              <div className="rounded-lg border border-destructive/50 p-3 space-y-2">
                <p className="text-sm font-medium">
                  Politically exposed person(s) awaiting sign-off
                </p>
                {pepsPendingSignoff.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm flex-1 min-w-0">{o.full_name}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reviewOwner.isPending}
                      onClick={() => reviewOwner.mutate({ ownerId: o.id, status: "approved" })}
                    >
                      Approve this person
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Documents</CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadOpen(true)}
              disabled={uploadOnBehalf.isPending}
            >
              <Upload className="w-4 h-4 mr-1" /> Upload on behalf
            </Button>
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
                    setRejectReason("");
                    setRejectTarget({ id: d.id, label: d.document_type.replace(/_/g, " ") });
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
            {blockers > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/50 p-3">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">Approval will be refused</p>
                  <ul className="text-muted-foreground mt-1 space-y-0.5">
                    {unresolvedHits.length > 0 && (
                      <li>{unresolvedHits.length} unresolved sanctions hit(s)</li>
                    )}
                    {pepsPendingSignoff.length > 0 && (
                      <li>{pepsPendingSignoff.length} PEP(s) awaiting sign-off</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Approval is blocked until every required business document is approved, every
              sanctions hit is reviewed, and every declared PEP is signed off.
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Messages with applicant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data!.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No messages yet. Send a note when you need a document or clarification.
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {data!.messages.map((m) => {
                  const fromAdmin = m.author_role === "admin";
                  return (
                    <div
                      key={m.id}
                      className={`rounded-lg border p-3 ${
                        fromAdmin ? "bg-primary/5 border-primary/20" : "bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {fromAdmin ? "You" : "Applicant"}
                        </span>
                        <span>{format(new Date(m.created_at), "PPp")}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-1">{m.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-2 pt-2 border-t">
              <Textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Write a message to the applicant. They will see it on their business status page."
                rows={3}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!newMessage.trim() || sendMessage.isPending}
                  onClick={() => sendMessage.mutate(newMessage)}
                >
                  <Send className="w-4 h-4 mr-1" /> Send
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!rejectTarget} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject document</DialogTitle>
            <DialogDescription>
              {rejectTarget && (
                <>Provide a reason for rejecting <span className="font-medium capitalize">{rejectTarget.label}</span>. The applicant will see this message.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection (required)"
            rows={4}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || reviewDoc.isPending}
              onClick={() => {
                if (!rejectTarget) return;
                const reason = rejectReason.trim();
                const docId = rejectTarget.id;
                setRejectTarget(null);
                reviewDoc.mutate({ docId, status: "rejected", reason });
              }}
            >
              Reject document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={(open) => !open && setUploadOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload document on behalf of applicant</DialogTitle>
            <DialogDescription>
              Use this when the applicant sent the file privately (email, support thread) and you
              need to attach it to their record. It will be marked as pending and you can approve
              it from the list above.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="kyb-upload-file">File</Label>
              <Input
                id="kyb-upload-file"
                ref={fileInputRef}
                type="file"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data?.owners && data.owners.length > 0 && (
              <div className="space-y-1.5">
                <Label>Owner (optional)</Label>
                <Select value={uploadOwnerId || "_none"} onValueChange={(v) => setUploadOwnerId(v === "_none" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Business-level document" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Business-level document</SelectItem>
                    {data.owners.map((o: BusinessOwner) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!uploadFile || uploadOnBehalf.isPending}
              onClick={() => uploadOnBehalf.mutate()}
            >
              {uploadOnBehalf.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default KybReviewPage;
