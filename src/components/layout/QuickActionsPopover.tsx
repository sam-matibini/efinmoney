import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LayoutGrid, Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import SavingsModal from "@/components/modals/SavingsModal";
import {
  headerIconBase,
  headerIconBreathe,
  headerIconInteractive,
  headerIconVariants,
  quickActionTileTones,
} from "@/components/layout/headerStyles";

type Item =
  | { kind: "modal"; Modal: React.ComponentType<{ children: React.ReactNode }>; icon: LucideIcon; label: string }
  | { kind: "link"; to: string; icon: LucideIcon; label: string };

const items: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send" },
  { kind: "link", to: "/wallet/topup", icon: Download, label: "Add Money" },
  { kind: "link", to: "/wallet/receive", icon: Smartphone, label: "Receive" },
  { kind: "link", to: "/pay-bills", icon: CreditCard, label: "Pay Bills" },
  { kind: "link", to: "/send?mode=canada", icon: MapPin, label: "Domestic" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange" },
  { kind: "modal", Modal: MobileMoneyModal, icon: Smartphone, label: "Mobile Money" },
  { kind: "modal", Modal: SavingsModal, icon: PiggyBank, label: "Savings" },
];

const QuickActionsPopover = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`${headerIconBase} ${headerIconInteractive} ${headerIconVariants.quickActions} ${headerIconBreathe}`}
          aria-label="Quick Actions"
        >
          <LayoutGrid className="w-5 h-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-3">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => {
            const tone = quickActionTileTones[item.label] ?? quickActionTileTones.Send;
            return item.kind === "modal" ? (
              <item.Modal key={item.label}>
                <div className="group flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer header-hover-lift">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 ${tone}`}>
                    <item.icon className="w-4 h-4 header-hover-icon" />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight text-[hsl(230,18%,38%)] dark:text-[hsl(230,12%,72%)] group-hover:text-foreground">
                    {item.label}
                  </span>
                </div>
              </item.Modal>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="group flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-muted/50 transition-colors header-hover-lift"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 ${tone}`}>
                  <item.icon className="w-4 h-4 header-hover-icon" />
                </div>
                <span className="text-[10px] font-medium text-center leading-tight text-[hsl(230,18%,38%)] dark:text-[hsl(230,12%,72%)] group-hover:text-foreground">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default QuickActionsPopover;
