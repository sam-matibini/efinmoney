import { useNavigate } from "react-router-dom";
import { Clock, Mail } from "lucide-react";
import KybShell from "@/components/kyb/KybShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useKyb } from "@/hooks/useKyb";

const Submitted = () => {
  const navigate = useNavigate();
  const { business } = useKyb();

  return (
    <KybShell
      title="Application submitted"
      subtitle={
        business?.legal_name
          ? `${business.legal_name} is now with our compliance team.`
          : "Your application is now with our compliance team."
      }
    >
      <Card className="p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Usually 1–2 business days</p>
          <p className="text-xs text-muted-foreground">
            We may contact you if we need anything else.
          </p>
        </div>
      </Card>

      <Card className="p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Mail className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">We'll email you the decision</p>
          <p className="text-xs text-muted-foreground">
            Sent to {business?.business_email || "your account email"}. You'll also see it in
            your notifications. Once approved, your business account is enabled for payments
            straight away.
          </p>
        </div>
      </Card>

      <Button onClick={() => navigate("/dashboard")} size="lg" className="w-full">
        Back to dashboard
      </Button>
    </KybShell>
  );
};

export default Submitted;
