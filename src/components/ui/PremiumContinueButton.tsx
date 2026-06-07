import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface PremiumContinueButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children?: React.ReactNode;
}

const Spinner = () => (
  <motion.div
    className="relative h-5 w-5"
    animate={{ rotate: 360 }}
    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      className="text-current"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="40"
        strokeDashoffset="30"
        opacity="0.35"
      />
      <motion.circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="40"
        animate={{ strokeDashoffset: [30, 10, 30] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  </motion.div>
);

const PremiumContinueButton = React.forwardRef<
  HTMLButtonElement,
  PremiumContinueButtonProps
>(({ className, loading = false, children, ...props }, ref) => {
  return (
    <button
      ref={ref}
      disabled={loading || props.disabled}
      className={cn(
        "relative inline-flex items-center justify-center gap-2.5",
        "w-full h-12 rounded-xl text-sm font-semibold",
        "bg-primary text-primary-foreground",
        "shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.45)]",
        "transition-all duration-200 ease-out",
        "hover:shadow-[0_12px_32px_-8px_hsl(var(--primary)/0.55)] hover:-translate-y-0.5",
        "active:translate-y-0 active:shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.35)]",
        "disabled:pointer-events-none disabled:opacity-60",
        className
      )}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <motion.div
            key="spinner"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5"
          >
            <Spinner />
            <span>Processing…</span>
          </motion.div>
        ) : (
          <motion.span
            key="content"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5"
          >
            {children}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
});

PremiumContinueButton.displayName = "PremiumContinueButton";

export { PremiumContinueButton };
