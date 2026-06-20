import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LayoutGrid, Send, Download, RefreshCw, Smartphone, CreditCard, PiggyBank, MapPin, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import ExchangeModal from "@/components/modals/ExchangeModal";
import MobileMoneyModal from "@/components/modals/MobileMoneyModal";
import SavingsModal from "@/components/modals/SavingsModal";

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
          className="p-2.5 rounded-xl hover:bg-muted transition-colors"
          aria-label="Quick Actions"
        >
          <LayoutGrid className="w-5 h-5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-3">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => (
            item.kind === "modal" ? (
              <item.Modal key={item.label}>
                <div className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <item.icon className="w-4 h-4 text-primary" />
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
                className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-4 h-4 text-primary" />
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
