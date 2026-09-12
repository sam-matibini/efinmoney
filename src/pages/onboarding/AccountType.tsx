import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { User, Building2, ArrowRight, Check } from "lucide-react";
import OnboardingShell from "@/components/kyc/OnboardingShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AccountType = "personal" | "business";

const OPTIONS: {
  value: AccountType;
  icon: typeof User;
  title: string;
  subtitle: string;
  perks: string[];
  href: string;
}[] = [
  {
    value: "personal",
    icon: User,
    title: "Personal account",
    subtitle: "For an individual sending, receiving and spending money.",
    perks: ["Ready to use right away", "Persona, Interac, or document upload", "Takes a few minutes"],
    href: "/onboarding/identity",
  },
  {
    value: "business",
    icon: Building2,
    title: "Business account",
    subtitle: "For a registered company, sole proprietorship or non-profit. Verified by staff document review — not Persona or Interac.",
    perks: ["Manual KYB document review", "Owner / director verification", "Approval in 1–2 business days"],
    href: "/onboarding/business/details",
  },
];

const AccountType = () => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<AccountType | null>(null);

  const cont = () => {
    const opt = OPTIONS.find((o) => o.value === selected);
    if (opt) navigate(opt.href);
  };

  return (
    <OnboardingShell
      title="How will you use eFinMoney?"
      subtitle="Choose the account type that fits you. Personal identity can use Persona, Interac, or a manual document review. Business accounts go through a staff KYB review."
      hideSaveExit
    >
      <div className="grid gap-4">
        {OPTIONS.map((opt, i) => {
          const Icon = opt.icon;
          const active = selected === opt.value;
          return (
            <motion.button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className="text-left"
              aria-pressed={active}
            >
              <Card
                className={cn(
                  "relative p-5 transition-colors sm:p-6",
                  active ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/40"
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-colors",
                      active ? "bg-primary/15 text-primary" : "bg-secondary text-foreground"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground">{opt.title}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{opt.subtitle}</p>
                    <ul className="mt-3 space-y-1.5">
                      {opt.perks.map((perk) => (
                        <li key={perk} className="flex items-center gap-2 text-sm text-foreground">
                          <Check className="h-4 w-4 shrink-0 text-primary" />
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div
                    className={cn(
                      "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    )}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                  </div>
                </div>
              </Card>
            </motion.button>
          );
        })}
      </div>

      <Button onClick={cont} disabled={!selected} size="lg" className="w-full">
        Continue
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </OnboardingShell>
  );
};

export default AccountType;
