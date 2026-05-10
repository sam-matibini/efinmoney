import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import TierBadge from "@/components/kyc/TierBadge";
import { useAuth } from "@/hooks/useAuth";
import { useKyc } from "@/hooks/useKyc";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Check, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const FEATURE_LABELS: Record<string, string> = {
  receive: "Receive money",
  send: "Send money",
  international: "International transfers",
  virtual_card: "Virtual cards",
};

const Approved = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tier } = useKyc();
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("account_number, full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAccountNumber(data?.account_number || null);
        setFirstName((data?.full_name || "").split(" ")[0] || "there");
      });
  }, [user]);

  useEffect(() => {
    const t = setTimeout(() => navigate("/dashboard", { replace: true }), 2500);
    return () => clearTimeout(t);
  }, [navigate]);

  const copy = async () => {
    if (!accountNumber) return;
    await navigator.clipboard.writeText(accountNumber);
    setCopied(true);
    toast.success("Account number copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <OnboardingShell title={`Welcome to eFin Money, ${firstName}!`} subtitle="Your account is verified and ready to go.">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <Card className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/10 mx-auto flex items-center justify-center mb-3">
            <Sparkles className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">You're all set</h2>
          <p className="text-sm text-muted-foreground">Send, receive, and exchange globally.</p>
        </Card>
      </motion.div>

      {accountNumber && (
        <Card className="p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Your account number</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-2xl font-mono font-semibold text-foreground">{accountNumber}</p>
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </Card>
      )}

      {tier && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Your tier</h3>
            <TierBadge
              tier={tier.current_tier}
              daily={tier.daily_transaction_limit}
              monthly={tier.monthly_transaction_limit}
              single={tier.single_transaction_limit}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Daily</p>
              <p className="font-semibold text-foreground text-sm">${Number(tier.daily_transaction_limit).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Monthly</p>
              <p className="font-semibold text-foreground text-sm">${Number(tier.monthly_transaction_limit).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Per txn</p>
              <p className="font-semibold text-foreground text-sm">${Number(tier.single_transaction_limit).toLocaleString()}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {Object.entries(tier.features_enabled || {}).map(([k, v]) =>
              v ? (
                <Badge key={k} variant="secondary">
                  {FEATURE_LABELS[k] || k}
                </Badge>
              ) : null
            )}
          </div>
        </Card>
      )}

      <Button size="lg" className="w-full" onClick={() => navigate("/dashboard")}>
        Go to Dashboard <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </OnboardingShell>
  );
};

export default Approved;
