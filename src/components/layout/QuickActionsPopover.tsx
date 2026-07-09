import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LayoutGrid, Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import SavingsModal from "@/components/modals/SavingsModal";

type Item =
  | { kind: "modal"; Modal: React.ComponentType<{ children: React.ReactNode }>; icon: LucideIcon; label: string; tone: string }
  | { kind: "link"; to: string; icon: LucideIcon; label: string; tone: string };

const items: Item[] = [
  { kind: "modal", Modal: SendMoneyModal, icon: Send, label: "Send", tone: "bg-sky-500/15 text-sky-500 dark:text-sky-400" },
  { kind: "link", to: "/wallet/topup", icon: Download, label: "Add Money", tone: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-400" },
  { kind: "link", to: "/wallet/receive", icon: Smartphone, label: "Receive", tone: "bg-teal-500/15 text-teal-500 dark:text-teal-400" },
  { kind: "link", to: "/pay-bills", icon: CreditCard, label: "Pay Bills", tone: "bg-orange-500/15 text-orange-500 dark:text-orange-400" },
  { kind: "link", to: "/send?mode=canada", icon: MapPin, label: "Domestic", tone: "bg-rose-500/15 text-rose-500 dark:text-rose-400" },
  { kind: "modal", Modal: ExchangeModal, icon: RefreshCw, label: "Exchange", tone: "bg-violet-500/15 text-violet-500 dark:text-violet-400" },
  { kind: "modal", Modal: MobileMoneyModal, icon: Smartphone, label: "Mobile Money", tone: "bg-fuchsia-500/15 text-fuchsia-500 dark:text-fuchsia-400" },
  { kind: "modal", Modal: SavingsModal, icon: PiggyBank, label: "Savings", tone: "bg-amber-500/15 text-amber-500 dark:text-amber-400" },
];

const QuickActionsPopover = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="group p-2.5 rounded-xl bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 dark:text-violet-400 transition-all duration-200 hover:scale-110 active:scale-95"
          aria-label="Quick Actions"
        >
          <LayoutGrid className="w-5 h-5 text-violet-500 dark:text-violet-400 transition-transform duration-300 group-hover:rotate-90" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-3">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => (
            item.kind === "modal" ? (
              <item.Modal key={item.label}>
                <div className="group flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${item.tone}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-medium text-center leading-tight text-foreground">
                    {item.label}
                  </span>
                </div>
              </item.Modal>
            ) : (
              <Link
                key={item.label}
                to={item.to}
                className="group flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110 group-active:scale-95 ${item.tone}`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-medium text-center leading-tight text-foreground">
                  {item.label}
                </span>
              </Link>
            )
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default QuickActionsPopover;
