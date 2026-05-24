import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import icon from "@/assets/efin-icon.png";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, { box: string; logo: string; ring: number }> = {
  sm: { box: "w-16 h-16", logo: "w-10 h-10", ring: 64 },
  md: { box: "w-24 h-24", logo: "w-14 h-14", ring: 96 },
  lg: { box: "w-32 h-32", logo: "w-20 h-20", ring: 128 },
};

interface Props {
  size?: Size;
  label?: string;
  subLabel?: string;
  /** ms after which a "Taking longer than expected…" hint appears */
  slowAfterMs?: number;
  className?: string;
}

const LogoLoader = ({
  size = "md",
  label,
  subLabel,
  slowAfterMs,
  className,
}: Props) => {
  const dims = SIZES[size];
  const [showSlow, setShowSlow] = useState(false);
  const [dots, setDots] = useState("");

  useEffect(() => {
    if (!slowAfterMs) return;
    const t = setTimeout(() => setShowSlow(true), slowAfterMs);
    return () => clearTimeout(t);
  }, [slowAfterMs]);

  useEffect(() => {
    if (!label) return;
    const i = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 450);
    return () => clearInterval(i);
  }, [label]);

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className={cn("relative flex items-center justify-center", dims.box)}>
        {/* Outer rotating conic ring */}
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.05) 35%, hsl(var(--primary) / 0.8) 70%, hsl(var(--primary)) 100%)",
            WebkitMask:
              "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
            mask: "radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))",
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
        />

        {/* Pulsing glow halo */}
        <motion.div
          aria-hidden
          className="absolute inset-1 rounded-full"
          style={{
            boxShadow:
              "0 0 28px hsl(var(--primary) / 0.55), inset 0 0 18px hsl(var(--primary) / 0.25)",
          }}
          animate={{ opacity: [0.45, 0.9, 0.45], scale: [0.96, 1.02, 0.96] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Floating logo */}
        <motion.img
          src={icon}
          alt="eFinMoney"
          className={cn(
            "relative z-10 object-contain rounded-2xl drop-shadow-[0_6px_22px_rgba(16,185,129,0.45)]",
            dims.logo
          )}
          animate={{ y: [0, -4, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {label && (
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">
            {label}
            <span className="inline-block w-4 text-left text-primary">{dots}</span>
          </p>
          {subLabel && (
            <p className="text-xs text-muted-foreground">{subLabel}</p>
          )}
          {showSlow && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xs text-amber-600 dark:text-amber-400"
            >
              Taking longer than expected…
            </motion.p>
          )}
        </div>
      )}
    </div>
  );
};

export default LogoLoader;
