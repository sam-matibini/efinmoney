import { useEffect, useState } from "react";
import { Camera, CheckCircle2, FileText, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import CountrySelect from "@/components/inputs/CountrySelect";
import DocumentUploader from "@/components/kyc/DocumentUploader";
import SelfieCaptureModal from "@/components/kyc/SelfieCaptureModal";
import { useAuth } from "@/hooks/useAuth";
import { useKyc } from "@/hooks/useKyc";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeStorageFilename } from "@/lib/storageKey";
import { toast } from "sonner";

const ID_TYPES = [
  { value: "passport", label: "Passport" },
  { value: "drivers_license", label: "Driver's licence" },
  { value: "national_id", label: "National ID" },
] as const;

type IdType = (typeof ID_TYPES)[number]["value"];

interface Props {
  onBack?: () => void;
  onSubmitted?: () => void;
}

const ManualKycForm = ({ onBack, onSubmitted }: Props) => {
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();
  const [idType, setIdType] = useState<IdType>("passport");
  const [country, setCountry] = useState("");
  const [idUrl, setIdUrl] = useState<string | null>(null);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [addressUrl, setAddressUrl] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!kyc) return;
    if (kyc.id_document_type === "passport" || kyc.id_document_type === "drivers_license" || kyc.id_document_type === "national_id") {
      setIdType(kyc.id_document_type);
    }
    if (kyc.id_document_country) setCountry(kyc.id_document_country);
    if (kyc.id_document_url) setIdUrl(kyc.id_document_url);
    if (kyc.selfie_url) setSelfieUrl(kyc.selfie_url);
    if (kyc.address_document_url) setAddressUrl(kyc.address_document_url);
  }, [kyc?.id_document_type, kyc?.id_document_country, kyc?.id_document_url, kyc?.selfie_url, kyc?.address_document_url]);

  const uploadToKyc = async (folder: string, file: File) => {
    if (!user) throw new Error("Not signed in");
    const path = `${user.id}/${folder}/${Date.now()}-${sanitizeStorageFilename(file.name)}`;
    const { error } = await supabase.storage.from("kyc-documents").upload(path, file, { upsert: true });
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    if (!user) return;
    if (!idType) return toast.error("Select the type of ID you're uploading.");
    if (!country) return toast.error("Select the country that issued your ID.");
    if (!idUrl) return toast.error("Upload a photo or scan of your ID.");
    if (!selfieUrl) return toast.error("Take a live selfie so we can match it to your ID.");

    setSubmitting(true);
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      user_id: user.id,
      verification_provider: "manual",
      verification_status: "pending_review",
      current_step: "identity",
      id_document_type: idType,
      id_document_country: country,
      id_document_url: idUrl,
      selfie_url: selfieUrl,
      id_verification_status: "pending",
      liveness_check_status: "pending",
      submitted_at: now,
    };
    if (addressUrl) {
      payload.address_document_url = addressUrl;
      payload.address_verification_status = "pending";
    }

    const { error } = await supabase.from("kyc_verifications").upsert(payload, { onConflict: "user_id" });
    if (error) {
      setSubmitting(false);
      toast.error(error.message || "Could not submit. Please try again.");
      return;
    }

    await supabase.from("profiles").update({ kyc_status: "submitted" }).eq("user_id", user.id);
    await refetch();
    setSubmitting(false);
    toast.success("Documents submitted for compliance review.");
    onSubmitted?.();
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground text-sm">Manual document review</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload a government ID and a live selfie. A compliance officer reviews them — typically within 1–2
              business days. Use this if Persona or Interac isn't available for you.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>ID type</Label>
          <Select value={idType} onValueChange={(v) => setIdType(v as IdType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ID_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Issuing country</Label>
          <CountrySelect value={country} onValueChange={setCountry} placeholder="Country on your ID" />
        </div>

        <DocumentUploader
          label="Photo of ID"
          uploadedPath={idUrl}
          onUpload={async (file) => {
            const path = await uploadToKyc("id", file);
            setIdUrl(path);
          }}
          onRemove={() => setIdUrl(null)}
        />
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Live selfie</h3>
          </div>
          {selfieUrl && (
            <span className="text-xs flex items-center gap-1 text-primary font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Captured
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Use your camera so we can confirm it's you. Hold your ID-matching face in good light.
        </p>
        <Button type="button" variant={selfieUrl ? "outline" : "default"} className="w-full" onClick={() => setSelfieOpen(true)}>
          <Camera className="w-4 h-4 mr-2" />
          {selfieUrl ? "Retake selfie" : "Take selfie"}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Proof of address</h3>
            <span className="text-xs font-normal text-muted-foreground">Optional</span>
          </div>
          {addressUrl && (
            <span className="text-xs flex items-center gap-1 text-primary font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Utility bill, bank statement, or government letter dated within the last 90 days. Helps the reviewer
          confirm your address.
        </p>
        <DocumentUploader
          label="Address document"
          uploadedPath={addressUrl}
          onUpload={async (file) => {
            const path = await uploadToKyc("address", file);
            setAddressUrl(path);
          }}
          onRemove={() => setAddressUrl(null)}
        />
      </Card>

      <Button size="lg" className="w-full" onClick={submit} disabled={submitting}>
        {submitting ? "Submitting…" : "Submit for manual review"}
      </Button>
      {onBack && (
        <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
          Choose a different method
        </Button>
      )}

      <SelfieCaptureModal
        open={selfieOpen}
        onOpenChange={setSelfieOpen}
        onCapture={async (blob) => {
          const file = new File([blob], "selfie.jpg", { type: blob.type || "image/jpeg" });
          const path = await uploadToKyc("selfie", file);
          setSelfieUrl(path);
        }}
      />
    </div>
  );
};

export default ManualKycForm;
