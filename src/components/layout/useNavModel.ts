import type { LucideIcon } from "lucide-react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Briefcase,
  FileText,
  Home,
  Landmark,
  Link2,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  LineChart,
  Activity,
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useKyb, type KybStep } from "@/hooks/useKyb";
import { isBusinessPrimaryAccount } from "@/lib/kybOnboarding";
import { productFeatures } from "@/lib/productFeatures";
import { prefetchRoute } from "@/lib/prefetchRoute";

export type NavLinkItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** CSS colour (token var) for the icon in its default state. */
  color: string;
};

export type NavGroup = {
  id: string;
  label: string;
  /** Group accent; the heading renders it at 70% opacity. */
  color: string;
  items: NavLinkItem[];
};

const C = {
  gold: "var(--color-accent-gold)",
  blue: "var(--color-accent-blue)",
  emerald: "var(--color-accent-emerald)",
  purple: "var(--color-accent-purple)",
  orange: "var(--color-accent-orange)",
  pink: "var(--color-accent-pink)",
  green: "var(--color-accent-green)",
  yellow: "var(--color-accent-yellow)",
  lightblue: "var(--color-accent-lightblue)",
  violet: "var(--color-accent-violet)",
  slate: "var(--color-accent-slate)",
};

const BIZ_STEP_PATH: Record<KybStep, string> = {
  details: "/onboarding/business/details",
  ownership: "/onboarding/business/ownership",
  documents: "/onboarding/business/documents",
  review: "/onboarding/business/review",
  completed: "/onboarding/business/details",
};

/** Navigation model shared by the sidebar, mobile bottom nav and profile menu. */
export function useNavModel() {
  const { user } = useAuth();
  const { isAdmin, isFinance, isCompliance } = useUserRoles();
  const { business, isApproved: hasBusiness } = useKyb();
  const location = useLocation();
  const queryClient = useQueryClient();
  const businessPrimary = isBusinessPrimaryAccount(user, business);

  let businessLabel = "Open a business account";
  let businessHref = "/onboarding/business/details";
  if (business) {
    if (hasBusiness) {
      businessLabel = "Business account";
      businessHref = "/business";
    } else if (business.kyb_status === "pending_review") {
      businessLabel = "Business application";
      businessHref = "/onboarding/business/submitted";
    } else if (business.kyb_status === "rejected" || business.kyb_status === "suspended") {
      businessLabel = "Business application";
      businessHref = "/onboarding/business/rejected";
    } else {
      businessLabel = "Continue business application";
      businessHref = BIZ_STEP_PATH[business.current_step] ?? "/onboarding/business/details";
    }
  }

  const groups: NavGroup[] = [
    {
      id: "overview",
      label: "Overview",
      color: C.gold,
      items: [{ label: "Dashboard", href: "/dashboard", icon: Home, color: C.gold }],
    },
    {
      id: "money",
      label: "Money Movement",
      color: C.blue,
      items: [
        { label: "Send", href: "/send", icon: ArrowUpRight, color: C.blue },
        { label: "Top Up", href: "/wallet/topup", icon: PlusCircle, color: C.emerald },
        ...(productFeatures.requestMoney
          ? [{ label: "Request", href: "/request-money", icon: ArrowDownLeft, color: C.purple }]
          : []),
        { label: "Exchange", href: "/exchange", icon: RefreshCw, color: C.orange },
      ],
    },
    {
      id: "accounts",
      label: "Accounts & Assets",
      color: C.pink,
      items: [
        { label: "Bank", href: "/wallet/receive", icon: Landmark, color: C.pink },
        { label: "Wallets", href: "/wallets", icon: Wallet, color: C.green },
        ...(productFeatures.billPay ? [{ label: "Bills", href: "/pay-bills", icon: FileText, color: C.yellow }] : []),
      ],
    },
    {
      id: "management",
      label: "Management",
      color: C.slate,
      items: [
        { label: "Contacts", href: "/contacts", icon: Users, color: C.lightblue },
        ...(productFeatures.paymentLinks
          ? [{ label: "Payment Links", href: "/payment-links", icon: Link2, color: C.lightblue }]
          : []),
        { label: "Business", href: businessHref, icon: Briefcase, color: C.violet },
      ],
    },
  ];

  const staffItems: NavLinkItem[] = [];
  if (!isAdmin && isFinance) staffItems.push({ label: "Finance", href: "/finance", icon: LineChart, color: C.slate });
  if (!isAdmin && (isFinance || isCompliance)) {
    staffItems.push({ label: "Operations", href: "/operations", icon: Activity, color: C.slate });
  }
  if (isAdmin) staffItems.push({ label: "Admin", href: "/admin", icon: ShieldCheck, color: C.slate });
  if (staffItems.length) groups[3].items.push(...staffItems);

  const isActive = (href: string) => {
    const path = location.pathname;
    if (href === "/dashboard") return path === "/" || path === "/dashboard";
    if (href.startsWith("/onboarding/business")) return path.startsWith("/onboarding/business") || path.startsWith("/business");
    if (href === "/business") return path.startsWith("/business");
    return path === href || path.startsWith(`${href}/`);
  };

  const warmRoute = (href: string) => {
    if (user?.id) prefetchRoute(queryClient, href, user.id);
  };

  return { groups, isActive, warmRoute, businessLabel, businessHref, businessPrimary };
}
