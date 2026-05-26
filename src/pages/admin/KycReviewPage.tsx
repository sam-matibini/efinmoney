import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KycStatusBadge, TierBadge } from "@/components/admin-portal/Badges";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle, Clock, FileText, ShieldAlert, ZoomIn, ZoomOut } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { extractRiskTags } from "@/lib/personaTags";
import { KycRiskTagChip } from "@/components/admin/KycRiskTagChip";

const REJECTION_REASONS = [
  "Document is blurry or unreadable",
  "Document appears to be expired",
  "Selfie doesn't match the ID photo",
  "Document type not supported",
  "Address document is older than 3 months",
  "Information mismatch",
  "Other (custom reason)",
];

const useSignedUrl = (path: string | null | undefined) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    // Path may be a JSON object containing front/back keys
    const tryGet = async (p: string) => {
      const { data } = await supabase.storage.from("kyc-documents").createSignedUrl(p, 3600);
      return data?.signedUrl || null;
    };
    (async () => {
      let p = path;
      try {
        const parsed = JSON.parse(path);
        if (parsed && typeof parsed === "object") {
          p = parsed.front || parsed.url || Object.values(parsed)[0] as string;
        }
      } catch { /* not JSON */ }
      const u = await tryGet(p);
      if (!cancelled) setUrl(u);
    })();
    return () => { cancelled = true; };
  }, [path]);
  return url;
};

const DocImage = ({ path, label }: { path: string | null | undefined; label: string }) => {
  const url = useSignedUrl(path);
  const [zoom, setZoom] = useState(1);
  if (!path) {
    return (
      <div className="border rounded-lg p-8 bg-muted/30 text-center text-sm text-muted-foreground">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        No {label.toLowerCase()} uploaded
      </div>
    );
  }
  if (!url) return <Skeleton className="h-64 w-full rounded-lg" />;
  const isPdf = url.toLowerCase().includes(".pdf");
  return (
    <div className="border rounded-lg overflow-hidden bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 bg-card border-b">
        <span className="text-xs font-medium">{label}</span>
        {!isPdf && (
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><ZoomOut className="w-3 h-3" /></Button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><ZoomIn className="w-3 h-3" /></Button>
          </div>
        )}
      </div>
      <div className="overflow-auto max-h-96 flex items-center justify-center p-2">
        {isPdf ? (
          <iframe src={url} title={label} className="w-full h-96" />
        ) : (
          <img src={url} alt={label} style={{ transform: `scale(${zoom})`, transformOrigin: "center" }} className="max-w-full transition-transform" />
        )}
      </div>
    </div>
  );
};

const KycReviewPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { admin, hasPermission, requirePermission } = useAdminAuth();
  const queryClient = useQueryClient();
  const [internalNotes, setInternalNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-kyc-detail", id],
    queryFn: async () => {
      const { data: kyc, error } = await supabase.from("kyc_verifications").select("*").eq("id", id!).maybeSingle();
      if (error) throw error;
      if (!kyc) return null;

      const [profileRes, tierRes, auditRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", kyc.user_id).maybeSingle(),
        supabase.from("user_risk_tiers").select("*").eq("user_id", kyc.user_id).maybeSingle(),
        supabase.from("kyc_audit_log").select("*").eq("kyc_verification_id", id!).order("created_at", { ascending: false }),
      ]);

      const adminIds = Array.from(new Set((auditRes.data || []).map((a) => a.admin_id).filter(Boolean) as string[]));
      const { data: admins } = adminIds.length
        ? await supabase.from("admin_users").select("id, full_name").in("id", adminIds)
        : { data: [] as Array<{ id: string; full_name: string | null }> };
      const adminMap = new Map((admins || []).map((a) => [a.id, a.full_name]));

      return {
        kyc,
        profile: profileRes.data,
        tier: tierRes.data,
        audit: (auditRes.data || []).map((e) => ({ ...e, admin_name: e.admin_id ? adminMap.get(e.admin_id) || "System" : "System" })),
      };
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.kyc.internal_notes) setInternalNotes(data.kyc.internal_notes);
  }, [data?.kyc.internal_notes]);

  // Approve
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveScope, setApproveScope] = useState<"id_only" | "id_and_address">("id_and_address");
  const [actionLoading, setActionLoading] = useState(false);

  const callEdge = async (fn: string, body: Record<string, unknown>) => {
    const { data: result, error } = await supabase.functions.invoke(fn, { body });
    if (error || (result && result.error)) {
      throw new Error((result && result.error) || error?.message || "Action failed");
    }
    return result;
  };

  const handleApprove = async () => {
    if (!requirePermission("approve_kyc") || !id) return;
    setActionLoading(true);
    try {
      await callEdge("approve-kyc", { verification_id: id, scope: approveScope, override: isFinal });
      toast.success(isFinal ? "Decision overridden — approved" : "Verification approved");
      setApproveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-kyc-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-kyc-queue"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Reject
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState(REJECTION_REASONS[0]);
  const [rejectCustom, setRejectCustom] = useState("");
  const [rejectScope, setRejectScope] = useState<"id" | "address" | "both">("both");

  const handleReject = async () => {
    if (!requirePermission("reject_kyc") || !id) return;
    const reason = rejectReason === "Other (custom reason)" ? rejectCustom.trim() : rejectReason;
    if (!reason) { toast.error("Please provide a reason"); return; }
    setActionLoading(true);
    try {
      await callEdge("reject-kyc", { verification_id: id, reason, scope: rejectScope, override: isFinal });
      toast.success(isFinal ? "Decision overridden — rejected" : "Verification rejected — user notified");
      setRejectOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-kyc-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-kyc-queue"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };


  // Request more info
  const [infoOpen, setInfoOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const handleRequestInfo = async () => {
    if (!requirePermission("request_info") || !id || !admin) return;
    if (!infoMessage.trim()) { toast.error("Message required"); return; }
    setActionLoading(true);
    try {
      const { error: upErr } = await supabase
        .from("kyc_verifications")
        .update({ verification_status: "in_progress" })
        .eq("id", id);
      if (upErr) throw upErr;
      await supabase.from("kyc_audit_log").insert({
        kyc_verification_id: id,
        admin_id: admin.id,
        action: "info_requested",
        previous_status: data?.kyc.verification_status || null,
        new_status: "in_progress",
        notes: infoMessage,
      });
      await callEdge("notify-user", { user_id: data?.kyc.user_id, type: "kyc_info_requested", message: infoMessage });
      toast.success("Info request sent");
      setInfoOpen(false);
      setInfoMessage("");
      queryClient.invalidateQueries({ queryKey: ["admin-kyc-detail", id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!requirePermission("escalate") || !id || !admin) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("kyc_verifications")
        .update({ escalated: true, escalated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await supabase.from("kyc_audit_log").insert({
        kyc_verification_id: id,
        admin_id: admin.id,
        action: "escalated",
        notes: "Escalated for super admin review",
      });
      toast.success("Escalated to super admin");
      queryClient.invalidateQueries({ queryKey: ["admin-kyc-detail", id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const saveNotes = async () => {
    if (!hasPermission("edit_internal_notes") || !id) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from("kyc_verifications")
        .update({ internal_notes: internalNotes })
        .eq("id", id);
      if (error) throw error;
      toast.success("Notes saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingNotes(false);
    }
  };

  if (isLoading) {
    return <AdminLayout><Skeleton className="h-96 w-full" /></AdminLayout>;
  }
  if (!data || !data.kyc) {
    return <AdminLayout><Card><CardContent className="p-12 text-center text-muted-foreground">Verification not found.</CardContent></Card></AdminLayout>;
  }

  const { kyc, profile, tier, audit } = data;
  const submitted = kyc.submitted_at ? new Date(kyc.submitted_at) : null;
  const overdueHours = submitted ? Math.round((Date.now() - submitted.getTime()) / 36e5) : 0;
  const isOverdue = overdueHours > 24 && kyc.verification_status === "pending_review";
  const idCountry = kyc.id_document_country;
  const addrCountry = profile?.address_country;
  const countryMismatch = idCountry && addrCountry && idCountry !== addrCountry;
  const attempts = audit.filter((a) => a.action === "submitted").length;

  const isFinal = kyc.verification_status === "approved" || kyc.verification_status === "rejected";

  return (
    <AdminLayout>
      <div className="space-y-4 max-w-7xl pb-24">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/kyc")}><ArrowLeft className="w-4 h-4 mr-1" /> Back to queue</Button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="font-display text-2xl font-semibold">KYC Review</h1>
            <p className="text-sm text-muted-foreground font-mono">#{kyc.id.slice(0, 8)}</p>
          </div>
          <div className="flex items-center gap-2">
            <KycStatusBadge status={kyc.verification_status} />
            {kyc.escalated && (
              <span className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1 rounded border border-amber-500/20">Escalated</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* LEFT: User info */}
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <CardHeader><CardTitle className="text-base">User</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground font-semibold">
                    {(profile?.full_name || profile?.email || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{profile?.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{profile?.email}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                  <div className="text-muted-foreground">Account #</div>
                  <div className="font-mono">{profile?.account_number || "—"}</div>
                  <div className="text-muted-foreground">Status</div>
                  <div className="capitalize">{profile?.account_status || "—"}</div>
                  <div className="text-muted-foreground">Current tier</div>
                  <div><TierBadge tier={tier?.current_tier} /></div>
                  <div className="text-muted-foreground">Joined</div>
                  <div>{profile?.created_at ? format(new Date(profile.created_at), "PP") : "—"}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Timeline</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Started</span><span>{format(new Date(kyc.created_at), "PPp")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Submitted</span><span>{submitted ? format(submitted, "PPp") : "—"}</span></div>
                {kyc.reviewed_at && <div className="flex justify-between"><span className="text-muted-foreground">Reviewed</span><span>{format(new Date(kyc.reviewed_at), "PPp")}</span></div>}
                {submitted && <div className="flex justify-between"><span className="text-muted-foreground">Time elapsed</span><span>{formatDistanceToNow(submitted)}</span></div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Risk indicators</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {!isOverdue && !countryMismatch && attempts <= 1 && (
                  <div className="text-muted-foreground">No risk indicators flagged.</div>
                )}
                {isOverdue && <div className="flex items-center gap-2 text-red-600 dark:text-red-400"><AlertTriangle className="w-4 h-4" /> Submission older than 24 hours ({overdueHours}h)</div>}
                {countryMismatch && <div className="flex items-center gap-2 text-red-600 dark:text-red-400"><AlertTriangle className="w-4 h-4" /> ID country ({idCountry}) ≠ address country ({addrCountry})</div>}
                {attempts > 1 && <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400"><AlertTriangle className="w-4 h-4" /> Multiple submission attempts ({attempts})</div>}
                <div className="flex items-center gap-2 text-muted-foreground text-xs pt-2 border-t">Selfie/ID face match: pending Persona integration</div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: Documents */}
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">ID Document</CardTitle>
                <p className="text-xs text-muted-foreground capitalize">{kyc.id_document_type?.replace("_", " ") || "—"} • {kyc.id_document_country || "—"}</p>
              </CardHeader>
              <CardContent>
                <DocImage path={kyc.id_document_url} label="ID Document" />
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Selfie</CardTitle></CardHeader>
                <CardContent><DocImage path={kyc.selfie_url} label="Selfie" /></CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Address Document</CardTitle>
                  <p className="text-xs text-muted-foreground capitalize">{kyc.address_document_type?.replace("_", " ") || "—"}</p>
                </CardHeader>
                <CardContent>
                  <DocImage path={kyc.address_document_url} label="Address Doc" />
                  {profile && (
                    <div className="mt-3 text-xs space-y-1 text-muted-foreground">
                      <div>{profile.street_address}</div>
                      <div>{[profile.city, profile.state_province, profile.postal_code].filter(Boolean).join(", ")}</div>
                      <div>{profile.address_country}</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Source of Funds Document</CardTitle>
                <p className="text-xs text-muted-foreground capitalize">
                  {(kyc as any).source_of_funds_type?.replace(/_/g, " ") || "—"}
                  {" · "}
                  Status: {(kyc as any).source_of_funds_status || "pending"}
                </p>
              </CardHeader>
              <CardContent>
                <DocImage path={(kyc as any).source_of_funds_url} label="Source of Funds" />
              </CardContent>
            </Card>


            {/* Internal notes */}
            {/* Persona Verification Results */}
            {(kyc.persona_inquiry_id || kyc.persona_decision) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4" /> Persona verification results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex flex-wrap gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Decision</div>
                      <div className={
                        kyc.persona_decision === "approved" ? "text-green-600 dark:text-green-400 font-medium capitalize" :
                        kyc.persona_decision === "declined" ? "text-red-600 dark:text-red-400 font-medium capitalize" :
                        kyc.persona_decision === "needs_review" ? "text-amber-600 dark:text-amber-400 font-medium capitalize" :
                        "text-muted-foreground capitalize"
                      }>
                        {kyc.persona_decision?.replace("_", " ") || "Pending"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Inquiry status</div>
                      <div className="capitalize">{kyc.persona_inquiry_status || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Inquiry ID</div>
                      <div className="font-mono text-xs">{kyc.persona_inquiry_id || "—"}</div>
                    </div>
                  </div>
                  {kyc.persona_decision_reason && (
                    <div>
                      <div className="text-xs text-muted-foreground">Decline reason</div>
                      <div className="text-red-600 dark:text-red-400">{kyc.persona_decision_reason}</div>
                    </div>
                  )}
                  {(() => {
                    const tags = extractRiskTags(kyc.persona_verification_data);
                    if (tags.length === 0) return null;
                    return (
                      <div className="pt-2 border-t">
                        <div className="text-xs text-muted-foreground mb-2">Risk flags raised by Persona</div>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((t) => <KycRiskTagChip key={t} tag={t} size="md" />)}
                        </div>
                      </div>
                    );
                  })()}
                  {kyc.persona_verification_data && (() => {
                    const fields = (kyc.persona_verification_data as any)?.data?.attributes?.payload?.data?.attributes?.fields;
                    if (!fields) return null;
                    const get = (k: string) => fields?.[k]?.value;
                    return (
                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
                        <div className="text-muted-foreground">Name</div>
                        <div>{[get("nameFirst"), get("nameLast")].filter(Boolean).join(" ") || "—"}</div>
                        <div className="text-muted-foreground">Date of birth</div>
                        <div>{get("birthdate") || "—"}</div>
                        <div className="text-muted-foreground">Document #</div>
                        <div>{get("identificationNumber") || "—"}</div>
                        <div className="text-muted-foreground">Expires</div>
                        <div>{get("expirationDate") || "—"}</div>
                      </div>
                    );
                  })()}
                  {kyc.persona_inquiry_id && (
                    <a
                      href={`https://app.withpersona.com/dashboard/inquiries/${kyc.persona_inquiry_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-primary underline pt-1"
                    >
                      View in Persona dashboard ↗
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Internal notes</CardTitle></CardHeader>
              <CardContent>
                <Textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={4}
                  placeholder="Visible only to other admins…"
                  disabled={!hasPermission("edit_internal_notes")}
                />
                <div className="flex justify-end mt-2">
                  <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes || !hasPermission("edit_internal_notes")}>
                    {savingNotes ? "Saving…" : "Save notes"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Audit trail */}
            <Card>
              <CardHeader><CardTitle className="text-base">Audit trail</CardTitle></CardHeader>
              <CardContent>
                {audit.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No audit entries yet.</div>
                ) : (
                  <div className="divide-y text-sm">
                    {audit.map((e) => (
                      <div key={e.id} className="py-2">
                        <div className="flex items-center justify-between">
                          <span><strong>{e.admin_name}</strong> {e.action.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground">{format(new Date(e.created_at), "PPp")}</span>
                        </div>
                        {(e.previous_status || e.new_status) && (
                          <div className="text-xs text-muted-foreground">{e.previous_status || "—"} → {e.new_status || "—"}</div>
                        )}
                        {e.notes && <div className="text-xs mt-1 italic">"{e.notes}"</div>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sticky action bar — always rendered, relabels as Override when final */}
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-card border-t border-border p-3 z-20">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-2 items-center justify-end">
            {isFinal && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mr-auto flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Already {kyc.verification_status} — actions will overwrite and be logged.
              </span>
            )}
            {!isFinal && kyc.persona_decision === "approved" && !kyc.reviewed_by && (
              <span className="text-xs text-amber-600 dark:text-amber-400 mr-auto flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" />
                Persona auto-approved — awaiting admin sign-off.
              </span>
            )}
            <Button variant="outline" disabled={!hasPermission("escalate") || actionLoading} onClick={handleEscalate}>Escalate</Button>
            <Button variant="outline" disabled={!hasPermission("request_info") || actionLoading} onClick={() => setInfoOpen(true)}>
              {isFinal ? "Re-request info" : "Request more info"}
            </Button>
            <Button variant="destructive" disabled={!hasPermission("reject_kyc") || actionLoading} onClick={() => setRejectOpen(true)}>
              {isFinal ? "Override → Reject" : "Reject"}
            </Button>
            <Button disabled={!hasPermission("approve_kyc") || actionLoading} onClick={() => setApproveOpen(true)}>
              {isFinal ? "Override → Approve" : "Approve"}
            </Button>
          </div>
        </div>

      </div>

      {/* Approve dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve verification</DialogTitle>
            <DialogDescription>Choose the tier this approval grants.</DialogDescription>
          </DialogHeader>
          <RadioGroup value={approveScope} onValueChange={(v) => setApproveScope(v as "id_only" | "id_and_address")} className="space-y-2">
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <RadioGroupItem value="id_only" id="id_only" className="mt-1" />
              <Label htmlFor="id_only" className="flex-1 cursor-pointer">
                <div className="font-medium">Approve ID only — Tier 2</div>
                <div className="text-xs text-muted-foreground">Up to $5,000/day, $50,000/month</div>
              </Label>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg">
              <RadioGroupItem value="id_and_address" id="id_and_address" className="mt-1" />
              <Label htmlFor="id_and_address" className="flex-1 cursor-pointer">
                <div className="font-medium">Approve ID + Address — Tier 3</div>
                <div className="text-xs text-muted-foreground">Up to $50,000/day, $500,000/month, international + virtual cards</div>
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={actionLoading}>Confirm approval</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject verification</DialogTitle>
            <DialogDescription>Provide a reason. The user will be notified.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Reason</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Applies to</Label>
              <Select value={rejectScope} onValueChange={(v) => setRejectScope(v as "id" | "address" | "both")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both ID and address</SelectItem>
                  <SelectItem value="id">ID document only</SelectItem>
                  <SelectItem value="address">Address document only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea value={rejectCustom} onChange={(e) => setRejectCustom(e.target.value)} placeholder={rejectReason === "Other (custom reason)" ? "Custom reason (required)…" : "Additional notes (optional)…"} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={actionLoading}>Confirm rejection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request info dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request more information</DialogTitle>
            <DialogDescription>This will revert the verification to in-progress and notify the user.</DialogDescription>
          </DialogHeader>
          <Textarea value={infoMessage} onChange={(e) => setInfoMessage(e.target.value)} placeholder="What additional information do you need?" rows={4} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInfoOpen(false)}>Cancel</Button>
            <Button onClick={handleRequestInfo} disabled={actionLoading}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default KycReviewPage;
