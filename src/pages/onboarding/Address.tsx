import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useKyc } from "@/hooks/useKyc";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import DocumentUploader from "@/components/kyc/DocumentUploader";
import { ISO_COUNTRIES } from "@/lib/isoCountries";
import { ArrowRight, FileText, Receipt, Landmark, Home, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type AddressDocType = "utility_bill" | "bank_statement" | "tax_document" | "lease_agreement";

const DOC_TYPES: { id: AddressDocType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "utility_bill", label: "Utility Bill", icon: Receipt },
  { id: "bank_statement", label: "Bank Statement", icon: Landmark },
  { id: "tax_document", label: "Tax Document", icon: FileText },
  { id: "lease_agreement", label: "Lease Agreement", icon: Home },
];

const Address = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();

  const [docType, setDocType] = useState<AddressDocType | "">("");
  const [docPath, setDocPath] = useState<string | null>(null);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Hydrate from existing record
  useEffect(() => {
    if (kyc) {
      if (kyc.address_document_type) setDocType(kyc.address_document_type as AddressDocType);
      if (kyc.address_document_url) setDocPath(kyc.address_document_url);
    }
  }, [kyc]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("street_address, city, state_province, postal_code, address_country, country_code")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setStreet(data.street_address || "");
        setCity(data.city || "");
        setStateProv(data.state_province || "");
        setPostal(data.postal_code || "");
        setCountry(data.address_country || data.country_code || kyc?.id_document_country || "");
      });
  }, [user, kyc]);

  // Auto-save profile fields every 30 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      supabase
        .from("profiles")
        .update({
          street_address: street || null,
          city: city || null,
          state_province: stateProv || null,
          postal_code: postal || null,
          address_country: country || null,
        })
        .eq("user_id", user.id);
    }, 30000);
    return () => clearInterval(interval);
  }, [user, street, city, stateProv, postal, country]);

  const persistKyc = async (patch: Record<string, unknown>) => {
    if (!user) return;
    await supabase.from("kyc_verifications").update(patch).eq("user_id", user.id);
  };

  const handleUpload = async (file: File) => {
    if (!user) throw new Error("not authenticated");
    const safe = file.name.replace(/\s+/g, "_");
    const path = `${user.id}/address/${Date.now()}_${safe}`;
    const { error } = await supabase.storage
      .from("kyc-documents")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    setDocPath(path);
    await persistKyc({ address_document_url: path, address_document_type: docType || null });
  };

  const canContinue = useMemo(
    () => !!docType && !!docPath && street && city && stateProv && postal && country,
    [docType, docPath, street, city, stateProv, postal, country]
  );

  const onContinue = async () => {
    if (!user) return;
    setSubmitting(true);
    await supabase
      .from("profiles")
      .update({
        street_address: street,
        city,
        state_province: stateProv,
        postal_code: postal,
        address_country: country,
      })
      .eq("user_id", user.id);
    await persistKyc({ current_step: "liveness" });
    await refetch();
    setSubmitting(false);
    navigate("/onboarding/review");
  };

  const saveDraft = async () => {
    if (!user) return;
    await supabase
      .from("profiles")
      .update({
        street_address: street || null,
        city: city || null,
        state_province: stateProv || null,
        postal_code: postal || null,
        address_country: country || null,
      })
      .eq("user_id", user.id);
    await persistKyc({
      current_step: "address",
      address_document_type: docType || null,
      address_document_url: docPath || null,
    });
  };

  return (
    <OnboardingShell
      step={2}
      title="Confirm your address"
      subtitle="Upload a recent proof of address and confirm your details."
      onSaveDraft={saveDraft}
    >

      <Card className="p-5 space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-xl bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
          <Info className="w-4 h-4 mt-0.5" />
          <p className="text-sm font-medium">Document must be dated within the last 3 months</p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Document type</label>
          <div className="grid grid-cols-2 gap-2">
            {DOC_TYPES.map((d) => {
              const Icon = d.icon;
              const active = docType === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={async () => {
                    setDocType(d.id);
                    await persistKyc({ address_document_type: d.id });
                  }}
                  className={cn(
                    "p-3 rounded-xl border-2 text-left transition-all hover:border-primary/50 flex items-center gap-3",
                    active ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <Icon className={cn("w-5 h-5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="text-sm font-medium text-foreground">{d.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {docType && (
          <DocumentUploader
            label="Upload document"
            uploadedPath={docPath}
            onUpload={handleUpload}
            onRemove={() => { setDocPath(null); persistKyc({ address_document_url: null }); }}
          />
        )}
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-semibold text-foreground">Your address</h3>
        <div className="space-y-2">
          <label className="text-sm font-medium">Street address</label>
          <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">City</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">State / Province</label>
            <Input value={stateProv} onChange={(e) => setStateProv(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Postal Code</label>
            <Input value={postal} onChange={(e) => setPostal(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Country</label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {ISO_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="mr-2">{c.flag}</span>{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Button size="lg" className="w-full" disabled={!canContinue || submitting} onClick={onContinue}>
        {submitting ? "Saving..." : "Continue"}
        <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </OnboardingShell>
  );
};

export default Address;
