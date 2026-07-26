import { Building2, ShieldCheck, Users, FileText, ArrowUpRight, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppPage from "@/components/layout/AppPage";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useKyb } from "@/hooks/useKyb";

const TIER_LABEL: Record<string, string> = {
  kyb_0: "Unverified",
  kyb_1: "Verified",
  kyb_2: "Enhanced",
};

const BusinessOverview = () => {
  const navigate = useNavigate();
  const { business, limits, owners, documents } = useKyb();

  // KybGuard guarantees an approved business before this renders.
  if (!business) return null;

  const fmt = (n: number | null | undefined) => `$${Number(n || 0).toLocaleString()}`;
  const beneficialOwners = owners.filter((o) => o.role === "beneficial_owner").length;

  const stats = [
    {
      icon: Users,
      label: "People on file",
      value: String(owners.length),
      hint: `${beneficialOwners} beneficial owner(s)`,
    },
    {
      icon: FileText,
      label: "Documents",
      value: String(documents.length),
      hint: "Submitted for verification",
    },
    {
      icon: Wallet,
      label: "Max balance",
      value: limits ? fmt(limits.max_balance) : "—",
      hint: limits?.label ?? "Tier limit",
    },
  ];

  return (
    <AppPage width="default" className="py-8" innerClassName="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Business account</h1>

      <PageHeroBanner
        icon={Building2}
        label="Business account"
        value={business.legal_name}
        meta={[
          {
            icon: ShieldCheck,
            text: `KYB ${TIER_LABEL[business.kyb_tier] ?? business.kyb_tier} · Approved`,
          },
          { icon: Building2, text: business.operating_name || business.industry || "Registered entity" },
        ]}
        variant="cta"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ icon: Icon, label, value, hint }) => (
          <Card key={label} className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Transaction limits</h2>
          <Badge variant="secondary" className="uppercase">
            {business.kyb_tier.replace("_", " ")}
          </Badge>
        </div>
        {limits ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Per transaction", value: limits.single_limit },
              { label: "Daily", value: limits.daily_limit },
              { label: "Monthly", value: limits.monthly_limit },
            ].map((l) => (
              <div key={l.label} className="rounded-lg border border-border p-4">
                <p className="text-xs text-muted-foreground">{l.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{fmt(l.value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Limits are being finalized for your tier.</p>
        )}
      </Card>

      <Card className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-foreground">Move money</h2>
          <p className="text-sm text-muted-foreground">
            Send business payouts and manage your wallets from the main dashboard.
          </p>
        </div>
        <Button onClick={() => navigate("/dashboard")} className="gap-2 shrink-0">
          Open wallets
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </Card>
    </AppPage>
  );
};

export default BusinessOverview;
