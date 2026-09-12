import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Upload, Check, Trash2, Clock, X, Camera } from "lucide-react";
import KybShell from "@/components/kyb/KybShell";
import KybStatusGate from "@/components/kyb/KybStatusGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SelfieCaptureModal from "@/components/kyc/SelfieCaptureModal";
import { useKyb, BusinessDocument, KybDocumentRequirement } from "@/hooks/useKyb";

// Owner requirement captured via camera rather than file upload.
const SELFIE_DOC_TYPE = "owner_selfie";

const StatusBadge = ({ status }: { status: BusinessDocument["status"] }) => {
  if (status === "approved")
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="w-3 h-3" /> Approved
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <X className="w-3 h-3" /> Rejected
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <Clock className="w-3 h-3" /> Pending review
    </Badge>
  );
};

const Documents = () => {
  const navigate = useNavigate();
  const {
    business,
    owners,
    documents,
    requirements,
    missingRequiredDocs,
    missingOwnerDocs,
    uploadDocument,
    removeDocument,
    saveBusiness,
  } = useKyb();

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [selfieCtx, setSelfieCtx] = useState<{
    req: KybDocumentRequirement;
    ownerId?: string;
  } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const businessReqs = requirements.filter((r) => r.applies_to === "business");
  const ownerReqs = requirements.filter((r) => r.applies_to === "owner");

  // One upload slot per (document type, owner) pair; owner is null for business docs.
  const slotKey = (type: string, ownerId?: string) => (ownerId ? `${type}:${ownerId}` : type);

  const docsFor = (type: string, ownerId?: string) =>
    documents.filter(
      (d) => d.document_type === type && (d.business_owner_id ?? undefined) === ownerId
    );

  const pick = async (
    req: KybDocumentRequirement,
    file: File | undefined,
    ownerId?: string
  ) => {
    if (!file) return;
    const key = slotKey(req.document_type, ownerId);
    setUploadingKey(key);
    try {
      await uploadDocument.mutateAsync({ file, documentType: req.document_type, ownerId });
      toast.success(`${req.label} uploaded.`);
    } catch (e: any) {
      toast.error(e?.message || "Upload failed.");
    } finally {
      setUploadingKey(null);
      const el = inputs.current[key];
      if (el) el.value = "";
    }
  };

  const captureSelfie = async (blob: Blob) => {
    if (!selfieCtx) return;
    const { req, ownerId } = selfieCtx;
    const key = slotKey(req.document_type, ownerId);
    setUploadingKey(key);
    try {
      const file = new File([blob], "selfie.jpg", { type: "image/jpeg" });
      await uploadDocument.mutateAsync({ file, documentType: req.document_type, ownerId });
      toast.success(`${req.label} captured.`);
    } finally {
      setUploadingKey(null);
    }
  };

  const cont = async () => {
    if (missingRequiredDocs.length > 0)
      return toast.error(`Still missing: ${missingRequiredDocs.map((r) => r.label).join(", ")}`);
    if (missingOwnerDocs.length > 0)
      return toast.error(
        `Still missing for ${missingOwnerDocs[0].ownerName}: ${missingOwnerDocs
          .filter((m) => m.ownerId === missingOwnerDocs[0].ownerId)
          .map((m) => m.label)
          .join(", ")}`
      );
    await saveBusiness.mutateAsync({ current_step: "review" });
    navigate("/onboarding/business/review");
  };

  if (!business) {
    return <KybStatusGate page="documents" />;
  }

  const renderReq = (req: KybDocumentRequirement, ownerId?: string) => {
    const key = slotKey(req.document_type, ownerId);
    const uploaded = docsFor(req.document_type, ownerId);
    return (
      <Card key={key} className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {req.label}
              {!req.is_required && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>
              )}
            </p>
            {req.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>
            )}
          </div>
        </div>

        {uploaded.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground truncate">{d.file_name}</p>
              {d.status === "rejected" && d.rejection_reason && (
                <p className="text-xs text-destructive mt-0.5">{d.rejection_reason}</p>
              )}
            </div>
            <StatusBadge status={d.status} />
            {d.status !== "approved" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDocument.mutate(d)}
                aria-label={`Remove ${d.file_name}`}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
        ))}

        {req.document_type === SELFIE_DOC_TYPE ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={uploadingKey === key}
            onClick={() => setSelfieCtx({ req, ownerId })}
          >
            <Camera className="w-4 h-4 mr-2" />
            {uploadingKey === key
              ? "Saving..."
              : uploaded.length
                ? "Retake selfie"
                : "Take selfie"}
          </Button>
        ) : (
          <>
            <input
              ref={(el) => (inputs.current[key] = el)}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
              onChange={(e) => pick(req, e.target.files?.[0], ownerId)}
            />
            <Button
              variant="outline"
              className="w-full"
              disabled={uploadingKey === key}
              onClick={() => inputs.current[key]?.click()}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadingKey === key
                ? "Uploading..."
                : uploaded.length
                  ? "Upload another"
                  : "Upload"}
            </Button>
          </>
        )}
      </Card>
    );
  };

  return (
    <KybShell
      step={3}
      title="Upload your documents"
      subtitle="PDF or image, up to 15 MB each. These files go to our compliance team for a manual KYB review — they are not sent to Persona or Interac."
    >
      <KybStatusGate page="documents" />
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Business documents
        </h3>
        {businessReqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading document list…</p>
        ) : (
          businessReqs.map((r) => renderReq(r))
        )}
      </div>

      {ownerReqs.length > 0 &&
        owners.map((o) => (
          <div key={o.id} className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {o.full_name}
            </h3>
            {ownerReqs.map((r) => renderReq(r, o.id))}
          </div>
        ))}

      <Button
        onClick={cont}
        disabled={
          missingRequiredDocs.length > 0 || missingOwnerDocs.length > 0 || saveBusiness.isPending
        }
        size="lg"
        className="w-full"
      >
        Continue to review
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>

      <SelfieCaptureModal
        open={!!selfieCtx}
        onOpenChange={(o) => {
          if (!o) setSelfieCtx(null);
        }}
        onCapture={captureSelfie}
      />
    </KybShell>
  );
};

export default Documents;
