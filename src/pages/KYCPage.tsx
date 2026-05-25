import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProfile } from "@/hooks/useProfile";
import { Shield, Upload, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";


const KYCPage = () => {
  const { data: profile, isLoading } = useProfile();
  const navigate = useNavigate();


  const status = profile?.kyc_status || 'pending';
  const tier = profile?.kyc_tier || 'tier_0';

  const isVerified = status === 'verified' || status === 'approved';

  const statusConfig = {
    verified: { icon: CheckCircle2, color: 'text-green-500', label: 'Verified' },
    approved: { icon: CheckCircle2, color: 'text-green-500', label: 'Approved' },
    pending: { icon: Clock, color: 'text-yellow-500', label: 'Pending Review' },
    rejected: { icon: AlertTriangle, color: 'text-destructive', label: 'Rejected' },
  } as const;

  const cfg = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">KYC Verification</h1>
        {isLoading ? (
          <Card className="p-6">Loading...</Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-foreground" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-foreground">Verification Status</h2>
                    <Icon className={`w-4 h-4 ${cfg.color}`} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Your account is currently <span className="font-medium text-foreground">{cfg.label}</span>
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="secondary">Status: {cfg.label}</Badge>
                    <Badge variant="outline">{tier.replace('_', ' ').toUpperCase()}</Badge>
                  </div>
                </div>
              </div>
            </Card>

            {!isVerified && (
              <Card className="p-6">
                <h3 className="font-semibold text-foreground mb-2">Complete Your Verification</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload your government-issued ID and proof of address to unlock higher transaction limits.
                </p>
                <Button onClick={() => navigate("/onboarding/identity")}>
                  <Upload className="w-4 h-4 mr-2" />
                  Start ID Verification
                </Button>

              </Card>
            )}

            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-3">Tier Limits</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Tier 0</span><span>$500/day</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tier 1</span><span>$5,000/day</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tier 2</span><span>$25,000/day</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tier 3</span><span>$100,000/day</span></div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default KYCPage;
