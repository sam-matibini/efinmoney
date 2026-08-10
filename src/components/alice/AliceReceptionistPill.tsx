import { forwardRef } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Short label — ClearBank style: "Ask ClearBank's AI Expert" */
  label?: string;
  /** Compact icon-only on very small screens when false. */
  alwaysShowLabel?: boolean;
}

/**
 * ClearBank-inspired receptionist entry point:
 * white pill + gradient avatar + "Ask Alice's AI Expert".
 * @see https://clear.bank/begin
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
        "shadow-[0_8px_28px_rgba(15,23,42,0.12)] transition-transform duration-200",
        "hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,23,42,0.16)]",
        "active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60",
        "right-4 bottom-6",
        className,
      )}
      {...rest}
    >
      <span
        className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          background:
            "radial-gradient(circle at 30% 25%, #e8f7ff 0%, #c5f0ef 45%, #d9d4f7 100%)",
          boxShadow: "0 0 0 1px rgba(45,212,191,0.35), 0 0 18px rgba(45,212,191,0.35)",
        }}
      >
        <Mic className="h-4 w-4 text-slate-900" strokeWidth={2.25} aria-hidden />
        <span className="pointer-events-none absolute inset-0" aria-hidden>
          <span className="absolute left-[7px] top-[8px] h-1 w-1 rotate-45 bg-slate-900" />
          <span className="absolute right-[9px] top-[11px] h-[3px] w-[3px] rotate-45 bg-slate-900" />
          <span className="absolute bottom-[9px] right-[11px] h-1 w-1 rotate-45 bg-slate-900" />
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
          "pr-1 text-sm font-medium tracking-tight text-slate-900",
          !alwaysShowLabel && "hidden sm:inline",
        )}
      >
        {label}
      </span>
    </button>
  );
});

export default AliceReceptionistPill;
