import { Phone } from "lucide-react";
import { ALICE_FOREST, ALICE_FOREST_SOFT } from "@/components/alice/aliceAdvisorTheme";
import { cn } from "@/lib/utils";

type Props = {
  onCall: () => void;
  title?: string;
  subtitle?: string;
  /** Larger hero for the Call tab */
  size?: "card" | "hero";
};

/** Focal telephone CTA — encourages talking to Alice. */
export default function AliceCallHero({
  onCall,
  title = "Call Alice",
  subtitle = "Talk to eFinMoney's AI Expert — instant answers about your money",
  size = "card",
}: Props) {
  const hero = size === "hero";

  return (
    <button
      type="button"
      onClick={onCall}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl text-left text-white transition-transform active:scale-[0.99]",
        hero ? "px-5 py-8" : "px-4 py-5",
      )}
      style={{
        background: `linear-gradient(145deg, ${ALICE_FOREST_SOFT} 0%, ${ALICE_FOREST} 100%)`,
        boxShadow: "0 14px 36px rgba(11,61,46,0.28)",
      }}
    >
      {/* Soft pulse rings behind the phone */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-40 w-40 rounded-full opacity-30"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)",
          animation: "alice-call-pulse 2.4s ease-in-out infinite",
        }}
        aria-hidden
      />

      <div className={cn("relative flex items-center gap-4", hero && "flex-col text-center")}>
        <span
          className={cn(
            "relative flex shrink-0 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/25",
            hero ? "h-20 w-20" : "h-14 w-14",
          )}
        >
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-25 bg-white/40"
            style={{ animationDuration: "2s" }}
            aria-hidden
          />
          <Phone className={cn(hero ? "h-8 w-8" : "h-6 w-6")} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block font-semibold tracking-tight", hero ? "text-2xl" : "text-lg")}>
            {title}
          </span>
          <span className={cn("block text-white/80 mt-1", hero ? "text-sm max-w-[16rem] mx-auto" : "text-xs")}>
            {subtitle}
          </span>
          {hero && (
            <span className="mt-5 inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[color:var(--af)] group-hover:bg-white/95"
              style={{ ["--af" as string]: ALICE_FOREST }}
            >
              Start live call
            </span>
          )}
        </span>
      </div>

      <style>{`
        @keyframes alice-call-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(0.85); opacity: 0.25; }
          50% { transform: translate(-50%, -50%) scale(1.15); opacity: 0.45; }
        }
      `}</style>
    </button>
  );
}
