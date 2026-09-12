import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import KybShell from "@/components/kyb/KybShell";
import KybStatusGate from "@/components/kyb/KybStatusGate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useKyb } from "@/hooks/useKyb";

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div className="flex justify-between gap-4 py-1.5 text-sm">
    <span className="text-muted-foreground flex-shrink-0">{label}</span>
    <span className="text-foreground text-right break-words">{value || "—"}</span>
  </div>
);

const Review = () => {
  const navigate = useNavigate();
  const { business, owners, documents, ownershipTotal, canSubmit, submitForReview } = useKyb();
  const [attested, setAttested] = useState(false);

  if (!business) {
    return <KybStatusGate page="review" />;
  }

  const submit = async () => {
    if (!attested) return toast.error("You must confirm the declaration before submitting.");
    try {
      await submitForReview.mutateAsync();
      navigate("/onboarding/business/submitted");
    } catch (e: any) {
      toast.error(e?.message || "Could not submit for review.");
    }
  };

  return (
    <KybShell
      step={4}
      title="Review and submit"
      subtitle="Check everything below. You won't be able to edit while the application is under review."
    >
      <KybStatusGate page="review" />
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-3">Business</h3>
        <Row label="Legal name" value={business.legal_name} />
        <Row label="Operating name" value={business.operating_name} />
        <Row label="Entity type" value={business.entity_type?.replace(/_/g, " ")} />
        <Row label="Registration number" value={business.registration_number} />
        <Row label="Tax ID" value={business.tax_id} />
        <Row label="Incorporated" value={business.date_of_incorporation} />
        <Row
          label="Jurisdiction"
          value={[business.incorporation_region, business.incorporation_country]
            .filter(Boolean)
            .join(", ")}
        />
        <Row label="Industry" value={business.industry} />
        <Row
          label="Registered address"
          value={[
            business.street_address,
            business.city,
            business.state_province,
            business.postal_code,
          ]
            .filter(Boolean)
            .join(", ")}
        />
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground">Ownership &amp; control</h3>
          <span className="text-sm text-muted-foreground">{ownershipTotal.toFixed(2)}% declared</span>
        </div>
        {owners.map((o) => (
          <Row
            key={o.id}
            label={o.full_name}
            value={
              o.role === "beneficial_owner"
                ? `${Number(o.ownership_percent).toFixed(2)}%`
                : o.role.replace(/_/g, " ")
            }
          />
        ))}
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-3">Documents</h3>
        {documents.map((d) => (
          <Row key={d.id} label={d.document_type.replace(/_/g, " ")} value={d.file_name} />
        ))}
      </Card>

      <Card className="p-5 flex items-start gap-3">
        <Checkbox
          id="attest"
          checked={attested}
          onCheckedChange={(v) => setAttested(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="attest" className="text-sm font-normal leading-relaxed">
          I confirm that I am authorised to act on behalf of this business, and that the information
          and documents provided are true, complete and accurate. I understand that eFinMoney will
          verify this application through a manual compliance review (not Persona or Interac), and that
          providing false information is an offence.
        </Label>
      </Card>

      <Card className="p-4 flex items-center gap-3 bg-secondary/40">
        <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          Reviews are usually completed within 1–2 business days by our compliance team. We'll email you as soon as there's
          a decision.
        </p>
      </Card>

      <Button
        onClick={submit}
        disabled={!attested || !canSubmit || submitForReview.isPending}
        size="lg"
        className="w-full"
      >
        {submitForReview.isPending ? "Submitting..." : "Submit for review"}
      </Button>
    </KybShell>
  );
};

export default Review;
