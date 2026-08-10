import { forwardRef } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALICE_ACCENT, ALICE_BRAND, ALICE_BRAND_SOFT } from "@/components/alice/aliceAdvisorTheme";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Short label — ClearBank style: "Ask ClearBank's AI Expert" */
  label?: string;
  /** Compact icon-only on very small screens when false. */
  alwaysShowLabel?: boolean;
}

/**
 * Receptionist entry pill — brand indigo glow + amber spark accents.
 */
const AliceReceptionistPill = forwardRef<HTMLButtonElement, Props>(function AliceReceptionistPill(
  {
    label = "Ask Alice's AI Expert",
    alwaysShowLabel = true,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cn(
        "group fixed z-50 flex items-center gap-2.5 rounded-full border border-black/5 bg-white pl-1.5 pr-4 py-1.5",
        "shadow-[0_8px_28px_rgba(26,15,60,0.14)] transition-transform duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(26,15,60,0.2)]",
        "active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,184,0,0.55)]",
        "right-4 bottom-6",
        className,
      )}
      {...rest}
    >
      <span
        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 30% 25%, #efe8ff 0%, #d4c4ff 40%, ${ALICE_BRAND_SOFT} 100%)`,
          boxShadow: `0 0 0 1px ${ALICE_ACCENT}88, 0 0 18px ${ALICE_ACCENT}55`,
        }}
      >
        <Mic className="h-4 w-4 text-white" strokeWidth={2.25} aria-hidden />
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute left-[7px] top-[8px] h-1 w-1 rotate-45" style={{ background: ALICE_ACCENT }} />
          <span className="absolute right-[9px] top-[11px] h-[3px] w-[3px] rotate-45" style={{ background: ALICE_ACCENT }} />
          <span className="absolute bottom-[9px] right-[11px] h-1 w-1 rotate-45" style={{ background: ALICE_ACCENT }} />
        </span>
        <img
          src="/alice.png"
          alt=""
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 h-full w-full object-cover object-top opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      </span>
      <span
        className={cn(
          "pr-1 text-sm font-medium tracking-tight",
          !alwaysShowLabel && "hidden sm:inline",
        )}
        style={{ color: ALICE_BRAND }}
      >
        {label}
      </span>
    </button>
  );
});

export default AliceReceptionistPill;
