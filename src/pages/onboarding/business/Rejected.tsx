import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import KybShell from "@/components/kyb/KybShell";
import ApplicantKybMessages from "@/components/kyb/ApplicantKybMessages";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useKyb } from "@/hooks/useKyb";

const Rejected = () => {
  const navigate = useNavigate();
  const { business, documents, saveBusiness } = useKyb();

  const rejectedDocs = documents.filter((d) => d.status === "rejected");
  const suspended = business?.kyb_status === "suspended";

  const resubmit = async () => {
    await saveBusiness.mutateAsync({ kyb_status: "in_progress", current_step: "details" });
    navigate("/onboarding/business/details");
  };

  return (
    <KybShell
      title={suspended ? "Business account suspended" : "We couldn't verify your business"}
      subtitle={
        suspended
          ? "Contact support to discuss reinstating this account."
          : "Fix the items below and resubmit — your details have been kept."
      }
    >
      {business?.rejection_reason && (
        <Card className="p-5 flex items-start gap-3 border-destructive/50">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Reason</p>
            <p className="text-sm text-muted-foreground mt-0.5">{business.rejection_reason}</p>
          </div>
        </Card>
      )}

      {rejectedDocs.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-foreground mb-3">Documents to replace</h3>
          {rejectedDocs.map((d) => (
            <div key={d.id} className="py-1.5">
              <p className="text-sm text-foreground">{d.document_type.replace(/_/g, " ")}</p>
              {d.rejection_reason && (
                <p className="text-xs text-destructive">{d.rejection_reason}</p>
              )}
            </div>
          ))}
        </Card>
      )}

      {business?.id && <ApplicantKybMessages businessId={business.id} />}

      {suspended ? (
        <Button onClick={() => navigate("/support")} size="lg" className="w-full">
          Contact support
        </Button>
      ) : (
        <Button
          onClick={resubmit}
          disabled={saveBusiness.isPending}
          size="lg"
          className="w-full"
        >
          {saveBusiness.isPending ? "Reopening..." : "Update and resubmit"}
        </Button>
      )}
    </KybShell>
  );
};

export default Rejected;
