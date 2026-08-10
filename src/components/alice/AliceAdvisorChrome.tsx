import { type ReactNode } from "react";
import {
  CheckSquare,
  ChevronDown,
  CircleHelp,
  Home,
  MessageCircle,
  Phone,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import {
  ALICE_ACCENT,
  ALICE_BRAND,
  ALICE_BRAND_MID,
  ALICE_BRAND_SOFT,
  ALICE_CREAM,
  type AliceTab,
} from "@/components/alice/aliceAdvisorTheme";

type ChromeProps = {
  open: boolean;
  firstName?: string | null;
  tab: AliceTab;
  onTabChange: (tab: AliceTab) => void;
  onClose: () => void;
  onMinimize: () => void;
  /** Hide Messages tab for logged-out visitors */
  showMessages?: boolean;
  children: ReactNode;
};

/**
 * Floating Loop-style advisor card: green header, body, bottom nav with Call elevated.
 */
export function AliceAdvisorChrome({
  open,
  firstName,
  tab,
  onTabChange,
  onClose,
  onMinimize,
  showMessages = true,
  children,
}: ChromeProps) {
  if (!open) return null;

  const greeting = firstName?.trim() ? `Hi ${firstName.trim().split(/\s+/)[0]} 👋` : "Hi there 👋";

  const nav: { id: AliceTab; label: string; icon: typeof Home; hide?: boolean }[] = [
    { id: "home", label: "Home", icon: Home },
    { id: "messages", label: "Messages", icon: MessageCircle, hide: !showMessages },
    { id: "call", label: "Call", icon: Phone },
    { id: "help", label: "Help", icon: CircleHelp },
    { id: "tasks", label: "Tasks", icon: CheckSquare },
  ];

  return (
    <div className="fixed z-50 right-3 bottom-3 sm:right-5 sm:bottom-5 flex flex-col items-end gap-2.5 pointer-events-none">
      <div
        className="pointer-events-auto w-[min(100vw-1.5rem,380px)] h-[min(72vh,640px)] flex flex-col overflow-hidden rounded-[1.35rem] border border-black/5 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)] animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-label="Alice AI Advisor"
      >
        {/* Header — Alice portrait anchors the right corner */}
        <div
          className="relative shrink-0 min-h-[168px] px-5 pt-4 pb-5 text-white"
          style={{
            background: `linear-gradient(165deg, ${ALICE_BRAND} 0%, ${ALICE_BRAND_SOFT} 52%, ${ALICE_BRAND_MID} 100%)`,
          }}
        >
          <div className="relative z-10 flex items-center justify-between gap-2 mb-4 pr-2">
            <Logo static className="h-7 w-auto brightness-0 invert opacity-95" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="relative z-20 h-8 w-8 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Copy stays left; leave room for Alice on the right */}
          <div className="relative z-10 max-w-[58%] pr-1 pb-1">
            {(tab === "home" || tab === "call") && (
              <div>
                <p className="text-sm text-white/85">{greeting}</p>
                <h2 className="text-[1.65rem] font-semibold tracking-tight leading-tight mt-0.5">
                  How can we help?
                </h2>
              </div>
            )}
            {tab === "messages" && (
              <div>
                <p className="text-sm text-white/85">Alice · AI Expert</p>
                <h2 className="text-xl font-semibold tracking-tight mt-0.5">Messages</h2>
              </div>
            )}
            {tab === "help" && (
              <div>
                <p className="text-sm text-white/85">Help centre</p>
                <h2 className="text-xl font-semibold tracking-tight mt-0.5">Get answers fast</h2>
              </div>
            )}
            {tab === "tasks" && (
              <div>
                <p className="text-sm text-white/85">Your checklist</p>
                <h2 className="text-xl font-semibold tracking-tight mt-0.5">Quick tasks</h2>
              </div>
            )}
          </div>

          {/* Alice ready to engage — right corner of the chatbox */}
          <div className="pointer-events-none absolute right-1 bottom-0 z-[5] h-[148px] w-[132px] select-none">
            <img
              src="/alice.png"
              alt="Alice, eFinMoney AI Expert"
              className="h-full w-full object-contain object-bottom drop-shadow-[0_10px_22px_rgba(0,0,0,0.35)]"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            {/* Phone cue — amber accent */}
            <span
              className="absolute bottom-4 left-1 flex h-9 w-9 items-center justify-center rounded-full shadow-md ring-2 ring-white/90"
              style={{ background: ALICE_ACCENT, color: ALICE_BRAND }}
              aria-hidden
            >
              <Phone className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </div>
        </div>

        {/* Body sits slightly over the header curve */}
        <div
          className="flex-1 min-h-0 flex flex-col -mt-2 rounded-t-2xl relative z-10"
          style={{ background: ALICE_CREAM }}
        >
          {children}
        </div>

        {/* Bottom nav — Call is the focal elevated item */}
        <nav
          className="shrink-0 border-t border-black/5 bg-white px-1 pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] grid"
          style={{
            gridTemplateColumns: `repeat(${nav.filter((n) => !n.hide).length}, minmax(0, 1fr))`,
          }}
          aria-label="Alice advisor"
        >
          {nav
            .filter((n) => !n.hide)
            .map((item) => {
              const active = tab === item.id;
              const isCall = item.id === "call";
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
                    active && !isCall ? "text-[color:var(--alice-brand)]" : "text-slate-400",
                    active && isCall && "text-[color:var(--alice-brand)]",
                  )}
                  style={{ ["--alice-brand" as string]: ALICE_BRAND }}
                >
                  {isCall ? (
                    <span
                      className={cn(
                        "absolute -top-5 flex h-12 w-12 items-center justify-center rounded-full shadow-lg",
                        "ring-4 ring-white transition-transform",
                        active ? "scale-105" : "scale-100 hover:scale-105",
                      )}
                      style={{
                        background: `linear-gradient(145deg, ${ALICE_ACCENT}, #FF9F0A)`,
                        color: ALICE_BRAND,
                        boxShadow: active
                          ? `0 8px 24px rgba(255,184,0,0.55), 0 0 0 6px rgba(255,184,0,0.18)`
                          : `0 8px 20px rgba(26,15,60,0.35)`,
                      }}
                    >
                      <Phone className="h-5 w-5" strokeWidth={2.25} />
                    </span>
                  ) : (
                    <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
                  )}
                  <span className={cn(isCall && "mt-6")}>{item.label}</span>
                </button>
              );
            })}
        </nav>
      </div>

      {/* Minimize — Loop-style chevron under the card */}
      <button
        type="button"
        onClick={onMinimize}
        aria-label="Minimize Alice"
        className="pointer-events-auto h-10 w-10 rounded-full flex items-center justify-center text-white shadow-lg"
        style={{ background: ALICE_BRAND }}
      >
        <ChevronDown className="h-5 w-5" />
      </button>
    </div>
  );
}

export function AliceCard({
  className,
  children,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full rounded-2xl border border-black/5 bg-white p-3.5 text-left shadow-sm",
          "hover:border-black/10 hover:shadow-md transition-all",
          className,
        )}
      >
        {children}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-black/5 bg-white p-3.5 text-left shadow-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}
