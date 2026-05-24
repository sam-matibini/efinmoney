import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import { Pencil, FileText, ImageIcon } from "lucide-react";
import { findIsoCountry } from "@/lib/isoCountries";
import { toast } from "sonner";

const ID_LABEL: Record<string, string> = {
  passport: "Passport",
  drivers_license: "Driver's License",
  national_id: "National ID",
};
const ADDR_LABEL: Record<string, string> = {
  utility_bill: "Utility Bill",
  bank_statement: "Bank Statement",
  tax_document: "Tax Document",
  lease_agreement: "Lease Agreement",
};

interface AddressInfo {
  street_address: string | null;
  city: string | null;
  state_province: string | null;
  postal_code: string | null;
  address_country: string | null;
}

const ThumbCard = ({ path, label }: { path: string | null; label: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    supabase.storage
      .from("kyc-documents")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl || null));
  }, [path]);
  const isPdf = path?.toLowerCase().endsWith(".pdf");
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
      <div className="w-12 h-12 rounded-md bg-background border flex items-center justify-center overflow-hidden flex-shrink-0">
        {isPdf || !url ? (
          <FileText className="w-5 h-5 text-muted-foreground" />
        ) : (
          <img src={url} alt={label} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="text-xs">
        <p className="text-foreground font-medium">{label}</p>
        <p className="text-muted-foreground truncate max-w-[180px]">
          {path?.split("/").pop()}
        </p>
      </div>
    </div>
  );
};

const Review = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [addr, setAddr] = useState<AddressInfo | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("street_address, city, state_province, postal_code, address_country")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setAddr(data as AddressInfo | null));
  }, [user]);

  const idDocs = (() => {
    if (!kyc?.id_document_url) return { front: null as string | null, back: null as string | null };
    try {
      const p = JSON.parse(kyc.id_document_url);
      return { front: p.front || null, back: p.back || null };
    } catch {
      return { front: kyc.id_document_url, back: null };
    }
  })();

  const idCountry = findIsoCountry(kyc?.id_document_country);

  const submit = async () => {
    if (!user || !agreed) return;
    setBusy(true);
    const { error } = await supabase
      .from("kyc_verifications")
      .update({
        verification_status: "pending_review",
        current_step: "completed",
        submitted_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Could not submit. Please try again.");
      setBusy(false);
      return;
    }
    await refetch();
    navigate("/onboarding/pending");
  };

  const saveDraft = async () => {
    if (!user) return;
    await supabase
      .from("kyc_verifications")
      .update({ current_step: "completed" })
      .eq("user_id", user.id);
  };

  return (
    <OnboardingShell
      step={3}
      title="Review and submit"
      subtitle="Double-check your details before sending them to our compliance team."
      onSaveDraft={saveDraft}
    >

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Identity</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding/identity")}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Document</p>
            <p className="text-foreground">{kyc?.id_document_type ? ID_LABEL[kyc.id_document_type] : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Country</p>
            <p className="text-foreground">
              {idCountry ? `${idCountry.flag} ${idCountry.name}` : "—"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
          <ThumbCard path={idDocs.front} label="Front" />
          {idDocs.back && <ThumbCard path={idDocs.back} label="Back" />}
          {kyc?.selfie_url && <ThumbCard path={kyc.selfie_url} label="Selfie" />}
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Address</h3>
          <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding/address")}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        </div>
        <div className="text-sm space-y-1 text-foreground">
          <p>{addr?.street_address || "—"}</p>
          <p>
            {[addr?.city, addr?.state_province, addr?.postal_code].filter(Boolean).join(", ") || "—"}
          </p>
          <p>{findIsoCountry(addr?.address_country)?.name || addr?.address_country || ""}</p>
        </div>
        <div className="text-xs text-muted-foreground">
          Document: {kyc?.address_document_type ? ADDR_LABEL[kyc.address_document_type] : "—"}
        </div>
        {kyc?.address_document_url && <ThumbCard path={kyc.address_document_url} label="Proof of address" />}
      </Card>

      <Card className="p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(!!v)} className="mt-0.5" />
          <span className="text-sm text-foreground">
            I confirm the information provided is accurate and I agree to the{" "}
            <a href="#" className="text-primary underline">Terms of Service</a> and{" "}
            <a href="#" className="text-primary underline">Privacy Policy</a>.
          </span>
        </label>
      </Card>

      <Button size="lg" className="w-full" disabled={!agreed || busy} onClick={submit}>
        {busy ? "Submitting..." : "Submit for Verification"}
      </Button>
    </OnboardingShell>
  );
};

export default Review;
