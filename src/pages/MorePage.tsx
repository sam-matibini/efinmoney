import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useTransfers } from "@/hooks/useTransfers";
import { Badge } from "@/components/ui/badge";
import {
  User as UserIcon,
  ShieldCheck,
  Bell,
  PieChart,
  KeyRound,
  ShieldAlert,
  Smartphone,
  Lock,
  Globe,
  Users,
  MessageSquare,
  ArrowLeftRight,
  LogOut,
  ChevronRight,
  Wallet,
  Settings,
  ShieldQuestion,
  CreditCard,
  Stamp,
  ExternalLink,
} from "lucide-react";
import { productFeatures } from "@/lib/productFeatures";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";

interface Row {
  icon: any;
  label: string;
  onClick: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}

const ListCard = ({ rows }: { rows: Row[] }) => (
  <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-card">
    {rows.map((r, i) => (
      <button
        key={r.label}
        onClick={r.onClick}
        className={`w-full flex items-center gap-3 px-4 py-4 hover:bg-muted/60 transition-colors ${
          i !== rows.length - 1 ? "border-b border-border" : ""
        }`}
      >
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            r.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          }`}
        >
          <r.icon className="w-4 h-4" />
        </div>
        <span
          className={`flex-1 text-left text-sm font-medium ${
            r.destructive ? "text-destructive" : "text-foreground"
          }`}
        >
          {r.label}
        </span>
        {r.right ?? <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
    ))}
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 mt-6 px-1">
    {children}
  </p>
);

const MorePage = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { data: profile } = useProfile();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const { data: transfers } = useTransfers(500);
  const completedCount = (transfers || []).filter(t => t.status === 'completed').length;
  const stampGoal = 25;
  const stamps = Math.min(completedCount, stampGoal);

  const verified = profile?.kyc_status === "approved" || profile?.kyc_status === "verified";

  return (
    <AppPage width="narrow" className="pt-6 md:pt-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">More</h1>
            <button
              onClick={() => navigate("/contacts")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-primary-foreground"
              style={{ background: "var(--gradient-cta)" }}
            >
              <Users className="w-4 h-4" />
              Contacts
            </button>
          </div>

          <PageHeroBanner
            icon={UserIcon}
            label="Your account"
            value={profile?.full_name || profile?.email || "Welcome back"}
            meta={[
              { icon: verified ? ShieldCheck : ShieldQuestion, text: verified ? "Identity verified" : "Complete KYC to unlock limits" },
              { icon: Stamp, text: `${stamps}/${stampGoal} transfer stamps collected` },
            ]}
            variant="primary"
          />

          {/* Rewards */}
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3 px-1 flex items-center gap-2">
            Rewards
          </p>
          <div className="rounded-2xl bg-card border border-border p-4 mb-2 shadow-card">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Stamp className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-foreground">Transfer stamps</p>
                  <Badge variant="outline" className="text-[10px]">{stamps}/{stampGoal}</Badge>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(stamps / stampGoal) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {stamps >= stampGoal
                    ? "Goal reached — keep earning rewards."
                    : `${stampGoal - stamps} more completed transfers to fill your card.`}
                </p>
              </div>
            </div>
          </div>

          {/* Notifications banner */}
          <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Stay up to date</p>
              <p className="text-xs text-muted-foreground">Enable notifications for real-time alerts.</p>
            </div>
            <button
              onClick={() => navigate("/security")}
              className="px-3 py-1.5 rounded-full text-xs font-semibold text-primary-foreground whitespace-nowrap"
              style={{ background: "var(--gradient-cta)" }}
            >
              Turn on
            </button>
          </div>

          {/* Account */}
          <SectionLabel>Account</SectionLabel>
          <ListCard
            rows={[
              { icon: UserIcon, label: "Your Profile", onClick: () => navigate("/profile") },
              {
                icon: ShieldCheck,
                label: "Account Verification",
                onClick: () => navigate("/kyc"),
                right: verified ? (
                  <Badge className="bg-primary/15 text-primary border-primary/30 hover:bg-primary/15">Verified</Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                ),
              },
              { icon: Bell, label: "Notifications", onClick: () => navigate("/security") },
              { icon: Users, label: "Contacts & Beneficiaries", onClick: () => navigate("/contacts") },
            ]}
          />

          {/* Finances */}
          <SectionLabel>Finances</SectionLabel>
          <ListCard
            rows={[
              { icon: Wallet, label: "My Wallets", onClick: () => navigate("/wallets") },
              ...(productFeatures.cards ? [{ icon: CreditCard, label: "Cards", onClick: () => navigate("/cards") }] : []),
              { icon: ArrowLeftRight, label: "Exchange Currency", onClick: () => navigate("/exchange") },
              { icon: PieChart, label: "Transaction Limits", onClick: () => navigate("/kyc") },
            ]}
          />

          {/* Security */}
          <SectionLabel>Security</SectionLabel>
          <ListCard
            rows={[
              { icon: KeyRound, label: "Change Password", onClick: () => navigate("/security") },
              { icon: ShieldAlert, label: "Two-Factor Authentication", onClick: () => navigate("/security") },
              { icon: Smartphone, label: "Devices & Sessions", onClick: () => navigate("/security") },
              { icon: Lock, label: "Privacy", onClick: () => navigate("/privacy") },
            ]}
          />

          {/* Others */}
          <SectionLabel>Others</SectionLabel>
          <ListCard
            rows={[
              { icon: Globe, label: "App Language", onClick: () => {} },
              { icon: Users, label: "Affiliates & Referrals", onClick: () => {} },
              { icon: MessageSquare, label: "Talk to Support", onClick: () => navigate("/support") },
              { icon: ArrowLeftRight, label: "See our rates", onClick: () => navigate("/exchange") },
            ]}
          />

          {/* Staff portals */}
          {(isAdmin || isFinance || isCompliance) && (
            <>
              <SectionLabel>Staff portals</SectionLabel>
              <ListCard
                rows={[
                  ...(isAdmin
                    ? [{ icon: ShieldQuestion, label: "Admin portal", onClick: () => navigate("/admin"), right: <ExternalLink className="w-4 h-4 text-muted-foreground" /> }]
                    : []),
                  ...(isFinance || isAdmin
                    ? [{ icon: Wallet, label: "Finance dashboard", onClick: () => navigate("/finance") }]
                    : []),
                  ...(isAdmin || isCompliance || isFinance
                    ? [{ icon: Settings, label: "Operations", onClick: () => navigate("/operations") }]
                    : []),
                ]}
              />
            </>
          )}

          {/* Sign out */}
          <div className="mt-8 mb-4 flex justify-center">
            <button
              onClick={() => signOut()}
              className="inline-flex items-center gap-2 text-sm font-semibold text-destructive hover:underline"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground/70">eFinMoney · v3.10.2</p>
        </motion.div>
    </AppPage>
  );
};

export default MorePage;
