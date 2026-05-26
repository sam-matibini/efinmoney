import { useState } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentUploader from "@/components/kyc/DocumentUploader";
import { ShieldCheck, FileText, Briefcase } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useKyc } from "@/hooks/useKyc";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SOURCE_OPTIONS = [
  { value: "employment", label: "Employment (pay stub or T4)" },
  { value: "self_employed", label: "Self-employment / business income" },
  { value: "investments", label: "Investments" },
  { value: "savings", label: "Personal savings" },
  { value: "inheritance", label: "Inheritance / gift" },
  { value: "other", label: "Other" },
];

const Enhanced = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { kyc, refetch } = useKyc();
  const [addressUrl, setAddressUrl] = useState<string | null>(kyc?.address_document_url ?? null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("employment");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user) return;
    if (!addressUrl) return toast.error("Please upload a proof of address.");
    if (!sourceUrl) return toast.error("Please upload proof of source of funds.");
    setSubmitting(true);
    const { error } = await supabase
      .from("kyc_verifications")
      .update({
        address_document_url: addressUrl,
        address_verification_status: "pending",
        source_of_funds_url: sourceUrl,
        source_of_funds_type: sourceType,
        source_of_funds_status: "pending",
        tier_target: "tier_3",
        verification_status: "pending_review",
      })
      .eq("user_id", user.id);
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit. Please try again.");
      return;
    }
    await refetch();
    toast.success("Submitted for enhanced review.");
    navigate("/dashboard");
  };

  return (
    <OnboardingShell
      title="Upgrade to Tier 3 — Enhanced"
      subtitle="Unlock $10,000+ balances, larger transfers, business and international payments."
    >
      <Card className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div className="text-sm">
          <p className="font-medium text-foreground">Enhanced due diligence</p>
          <p className="text-muted-foreground">FINTRAC requires proof of address and source of funds for high-value users.</p>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Proof of address</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Recent utility bill, bank statement, or government letter (dated within the last 90 days).
        </p>
        <DocumentUploader
          label="Address document"
          bucket="kyc-documents"
          pathPrefix={`${user?.id}/address`}
          onUploaded={setAddressUrl}
          currentUrl={addressUrl}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Source of funds</h3>
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={sourceType} onValueChange={setSourceType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DocumentUploader
          label="Supporting document"
          bucket="kyc-documents"
          pathPrefix={`${user?.id}/source-of-funds`}
          onUploaded={setSourceUrl}
          currentUrl={sourceUrl}
        />
      </Card>

      <Button size="lg" className="w-full" onClick={submit} disabled={submitting}>
        {submitting ? "Submitting..." : "Submit for review"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Manual compliance review · usually 1–2 business days.
      </p>
    </OnboardingShell>
  );
};

export default Enhanced;
