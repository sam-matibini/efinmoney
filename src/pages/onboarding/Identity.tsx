import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import DocumentUploader from "@/components/kyc/DocumentUploader";
import SelfieCaptureModal from "@/components/kyc/SelfieCaptureModal";
import PersonaVerification from "@/components/kyc/PersonaVerification";
import InteracVerification from "@/components/kyc/InteracVerification";
import { ISO_COUNTRIES } from "@/lib/isoCountries";
import { ArrowRight, Camera, IdCard, FileText, BookUser, CheckCircle2, Info, ShieldCheck, FlaskConical } from "lucide-react";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();


  const [country, setCountry] = useState<string>("");
  const [docType, setDocType] = useState<IdType | "">("");
  const [manualMode, setManualMode] = useState(false);
  const [frontPath, setFrontPath] = useState<string | null>(null);
  const [backPath, setBackPath] = useState<string | null>(null);
  const [selfiePath, setSelfiePath] = useState<string | null>(null);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [personaSubmitted, setPersonaSubmitted] = useState(false);

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
    if (kyc.persona_inquiry_id) setPersonaSubmitted(true);
  }, [kyc]);

  // Handle Interac OIDC redirect-back
  useEffect(() => {
    const interac = searchParams.get("interac");
    if (!interac) return;
    if (interac === "success") {
      toast.success("Identity verified with Interac");
      (async () => { await refetch(); navigate("/onboarding/address", { replace: true }); })();

    } else {
      const reason = searchParams.get("reason");
      toast.error(`Interac verification failed${reason ? `: ${reason}` : ""}. Try another method.`);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);


  const requiresBack = docType === "drivers_license" || docType === "national_id";

  const persist = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase.from("kyc_verifications").update(patch).eq("user_id", user.id);
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

  const canContinueManual = useMemo(() => {
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

  const onPersonaComplete = async () => {
    setPersonaSubmitted(true);
    await persist({ current_step: "address", verification_status: "in_progress" });
    await refetch();
    navigate("/onboarding/address");
  };

  const isSandbox = true; // PERSONA_ENVIRONMENT lives server-side; treat preview as sandbox

  return (
    <OnboardingShell step={1} title="Verify your identity" subtitle="We'll guide you through a quick automated check.">
      {isSandbox && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <FlaskConical className="w-3.5 h-3.5" />
          <span>
            Test Mode: use Persona's{" "}
            <a
              href="https://docs.withpersona.com/docs/sandbox-data"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              sandbox test data
            </a>
            . Real IDs not required.
          </span>
        </div>
      )}

      <Card className="p-5 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Issuing country</label>
          <Select
            value={country}
            onValueChange={async (v) => {
              setCountry(v);
              await persist({ id_document_country: v });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {ISO_COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="mr-2">{c.flag}</span>
                  {c.name}
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

      {!manualMode ? (
        <div className="space-y-3">
          <Card className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground text-sm">Verify with Persona</h3>
                <p className="text-xs text-muted-foreground">Global ID verification. Bank-grade, ~2 minutes.</p>
              </div>
            </div>
            {user && (
              <PersonaVerification
                userId={user.id}
                className="w-full"
                label={personaSubmitted ? "Restart Persona verification" : "Start with Persona"}
                onComplete={onPersonaComplete}
                onError={() => {
                  toast.error("Persona verification is temporarily unavailable.");
                }}
              />
            )}
          </Card>

          <Card className="p-5 space-y-3 border-emerald-500/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground text-sm">
                  Verify with Interac
                  <span className="ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Recommended in Canada</span>
                </h3>
                <p className="text-xs text-muted-foreground">Sign in with your Canadian bank to verify instantly.</p>
              </div>
            </div>
            <InteracVerification className="w-full" />
          </Card>

          <button
            type="button"
            className="block w-full text-xs text-muted-foreground underline hover:text-foreground text-center"
            onClick={() => setManualMode(true)}
          >
            Continue with manual upload instead
          </button>
        </div>
      ) : (

        <>
          {country && docType && (
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground text-sm">Manual document upload</h3>
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setManualMode(false)}
                >
                  Use automated check
                </button>
              </div>
              <DocumentUploader
                label="Front of document"
                uploadedPath={frontPath}
                onUpload={handleFront}
                onRemove={() => {
                  setFrontPath(null);
                  persist({ id_document_url: JSON.stringify({ front: null, back: backPath }) });
                }}
              />
              {requiresBack && (
                <DocumentUploader
                  label="Back of document"
                  uploadedPath={backPath}
                  onUpload={handleBack}
                  onRemove={() => {
                    setBackPath(null);
                    persist({ id_document_url: JSON.stringify({ front: frontPath, back: null }) });
                  }}
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
              <p className="text-sm text-muted-foreground mb-4">Look at the camera and follow the instructions</p>
              {selfiePath ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-foreground flex-1">Selfie captured</span>
                  <Button variant="outline" size="sm" onClick={() => setSelfieOpen(true)}>Retake</Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setSelfieOpen(true)}>
                  <Camera className="w-4 h-4 mr-2" /> Open camera
                </Button>
              )}
            </Card>
          )}

          <Button size="lg" className="w-full" disabled={!canContinueManual || submitting} onClick={onContinue}>
            {submitting ? "Saving..." : "Continue"}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </>
      )}

      <SelfieCaptureModal open={selfieOpen} onOpenChange={setSelfieOpen} onCapture={handleSelfie} />
    </OnboardingShell>
  );
};

export default Identity;
