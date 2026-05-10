import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import DocumentUploader from "@/components/kyc/DocumentUploader";
import SelfieCaptureModal from "@/components/kyc/SelfieCaptureModal";
import { ISO_COUNTRIES } from "@/lib/isoCountries";
import { ArrowRight, Camera, IdCard, FileText, BookUser, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type IdType = "passport" | "drivers_license" | "national_id";

const DOC_TYPES: { id: IdType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "passport", label: "Passport", icon: BookUser },
  { id: "drivers_license", label: "Driver's License", icon: IdCard },
  { id: "national_id", label: "National ID", icon: FileText },
];

const Identity = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();

  const [country, setCountry] = useState<string>("");
  const [docType, setDocType] = useState<IdType | "">("");
  const [frontPath, setFrontPath] = useState<string | null>(null);
  const [backPath, setBackPath] = useState<string | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Hydrate from existing KYC record
  useEffect(() => {
    if (!kyc) return;
    if (kyc.id_document_country) setCountry(kyc.id_document_country);
    if (kyc.id_document_type) setDocType(kyc.id_document_type as IdType);
    if (kyc.id_document_url) {
      try {
        const parsed = JSON.parse(kyc.id_document_url);
        setFrontPath(parsed.front || null);
        setBackPath(parsed.back || null);
      } catch {
        setFrontPath(kyc.id_document_url);
      }
    }
    if (kyc.selfie_url) setSelfiePath(kyc.selfie_url);
  }, [kyc]);

  const requiresBack = docType === "drivers_license" || docType === "national_id";

  const persist = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase
      .from("kyc_verifications")
      .update(patch)
      .eq("user_id", user.id);
  };

  const uploadTo = async (folder: "identity", file: File | Blob, name: string) => {
    if (!user) throw new Error("not authenticated");
    const safeName = name.replace(/\s+/g, "_");
    const path = `${user.id}/${folder}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: false, contentType: (file as File).type || "image/jpeg" });
    if (error) throw error;
    return path;
  };

  const handleFront = async (file: File) => {
    const path = await uploadTo("identity", file, file.name);
    setFrontPath(path);
    await persist({
      id_document_url: JSON.stringify({ front: path, back: backPath }),
      id_document_country: country || null,
      id_document_type: docType || null,
    });
  };

  const handleBack = async (file: File) => {
    const path = await uploadTo("identity", file, file.name);
    setBackPath(path);
    await persist({
      id_document_url: JSON.stringify({ front: frontPath, back: path }),
    });
  };

  const handleSelfie = async (blob: Blob) => {
    const path = await uploadTo("identity", blob, "selfie.jpg");
    setSelfiePath(path);
    await persist({ selfie_url: path });
  };

  const canContinue = useMemo(() => {
    if (!country || !docType || !frontPath || !selfiePath) return false;
    if (requiresBack && !backPath) return false;
    return true;
  }, [country, docType, frontPath, backPath, selfiePath, requiresBack]);

  const onContinue = async () => {
    setSubmitting(true);
    await persist({ current_step: "address" });
    await refetch();
    setSubmitting(false);
    navigate("/onboarding/address");
  };

  return (
    <OnboardingShell step={1} title="Verify your identity" subtitle="Upload a government-issued ID and take a quick selfie.">
      <Card className="p-5 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Issuing country</label>
          <Select value={country} onValueChange={async (v) => { setCountry(v); await persist({ id_document_country: v }); }}>
            <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {ISO_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="mr-2">{c.flag}</span>{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Document type</label>
          <div className="grid grid-cols-3 gap-2">
            {DOC_TYPES.map((d) => {
              const Icon = d.icon;
              const active = docType === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={async () => {
                    setDocType(d.id);
                    await persist({ id_document_type: d.id });
                  }}
                  className={cn(
                    "p-3 rounded-xl border-2 text-center transition-all hover:border-primary/50",
                    active ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <Icon className={cn("w-5 h-5 mx-auto mb-1", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-xs font-medium text-foreground">{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {country && docType && (
        <Card className="p-5 space-y-4">
          <DocumentUploader
            label="Front of document"
            uploadedPath={frontPath}
            onUpload={handleFront}
            onRemove={() => { setFrontPath(null); persist({ id_document_url: JSON.stringify({ front: null, back: backPath }) }); }}
          />
          {requiresBack && (
            <DocumentUploader
              label="Back of document"
              uploadedPath={backPath}
              onUpload={handleBack}
              onRemove={() => { setBackPath(null); persist({ id_document_url: JSON.stringify({ front: frontPath, back: null }) }); }}
            />
          )}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <p>Make sure the document is clear, well-lit, and all corners are visible.</p>
          </div>
        </Card>
      )}

      {country && docType && frontPath && (!requiresBack || backPath) && (
        <Card className="p-5">
          <h3 className="font-semibold text-foreground mb-1">Selfie verification</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Look at the camera and follow the instructions
          </p>
          {selfiePath ? (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <span className="text-sm text-foreground flex-1">Selfie captured</span>
              <Button variant="outline" size="sm" onClick={() => setSelfieOpen(true)}>
                Retake
              </Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setSelfieOpen(true)}>
              <Camera className="w-4 h-4 mr-2" /> Open camera
            </Button>
          )}
        </Card>
      )}

      <Button size="lg" className="w-full" disabled={!canContinue || submitting} onClick={onContinue}>
        {submitting ? "Saving..." : "Continue"}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>

      <SelfieCaptureModal open={selfieOpen} onOpenChange={setSelfieOpen} onCapture={handleSelfie} />
    </OnboardingShell>
  );
};

export default Identity;
