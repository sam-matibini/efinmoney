import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Send, Download, RefreshCw, Smartphone, Building2 } from "lucide-react";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import { productFeatures } from "@/lib/productFeatures";
import { useKyb, KybStep } from "@/hooks/useKyb";

type Item =
  | { kind: "modal"; Modal: any; icon: any; label: string; color: string }
  | { kind: "link"; to: string; icon: any; label: string; color: string };

const allItems: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send", color: "bg-primary/15 text-primary" },
  { kind: "link", to: "/wallet/topup", icon: Download, label: "Add Money", color: "bg-primary/10 text-primary" },
  { kind: "link", to: "/wallet/receive", icon: Smartphone, label: "Receive", color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange", color: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
];

const ICON_VARIANTS: Record<string, any> = {
  Send: { rest: { x: 0, rotate: 0 }, hover: { x: 3, rotate: -8 } },
  Exchange: { rest: { rotate: 0 }, hover: { rotate: 180 } },
  Deposit: { rest: { y: 0 }, hover: { y: 3 } },
};

const ButtonInner = ({ icon: Icon, label, color }: { icon: any; label: string; color: string }) => {
  const variant = ICON_VARIANTS[label] || { rest: { y: 0 }, hover: { y: -2 } };
  return (
    <motion.div
      whileHover="hover"
      initial="rest"
      animate="rest"
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      className="flex flex-col items-center gap-2 cursor-pointer"
    >
      <div
        className={`relative w-14 h-14 rounded-2xl flex items-center justify-center ${color} shadow-sm transition-all group-hover:shadow-md group-hover:bg-gradient-to-br group-hover:from-primary/20 group-hover:to-primary/5 overflow-hidden`}
      >
        <motion.span variants={variant} transition={{ type: "spring", stiffness: 400, damping: 14 }} className="inline-flex">
          <Icon className="w-6 h-6" />
        </motion.span>
        <span className="ripple-host absolute inset-0" />
      </div>
      <span className="text-xs font-medium text-foreground whitespace-nowrap">{label}</span>
    </motion.div>
  );
};

const QuickActions = () => {
  const { business, isApproved } = useKyb();

  // Persistent, always-visible dashboard entry into the business flow.
  // State-aware, mirroring BusinessPromptCard routing.
  const bizStepPath: Record<KybStep, string> = {
    details: "/onboarding/business/details",
    ownership: "/onboarding/business/ownership",
    documents: "/onboarding/business/documents",
    review: "/onboarding/business/review",
    completed: "/onboarding/business/details",
  };
  const businessTo = !business
    ? "/onboarding/business/details"
    : isApproved
      ? "/business"
      : business.kyb_status === "pending_review"
        ? "/onboarding/business/submitted"
        : business.kyb_status === "rejected" || business.kyb_status === "suspended"
          ? "/onboarding/business/rejected"
          : bizStepPath[business.current_step] ?? "/onboarding/business/details";

  const items: Item[] = [
    ...allItems,
    {
      kind: "link",
      to: businessTo,
      icon: Building2,
      label: "Business",
      color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <section className="mb-8">
      <h2 className="text-lg font-display font-semibold text-foreground mb-4">Quick Actions</h2>

      <div className="flex gap-4 sm:gap-5 overflow-x-auto pb-3 -mx-4 px-4 no-scrollbar">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="group shrink-0"
          >
            {item.kind === "modal" ? (
              <item.Modal>
                <div>
                  <ButtonInner icon={item.icon} label={item.label} color={item.color} />
                </div>
              </item.Modal>
            ) : (
              <Link to={item.to}>
                <ButtonInner icon={item.icon} label={item.label} color={item.color} />
              </Link>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
