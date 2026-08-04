import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type MoneyFlowStep = {
  n: number;
  label: string;
};

type Props = {
  steps: MoneyFlowStep[];
  currentStep: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Primary actions (Continue, Cancel) rendered below the card body */
  footer?: ReactNode;
  className?: string;
  /** Optional header slot above the stepper (e.g. quiet tabs) */
  above?: ReactNode;
  /** Optional control rendered inline to the right of the title (e.g. country picker) */
  headerRight?: ReactNode;
};

/**
 * Shared money-flow chrome for Send + Add Money:
 * centered elevated card, stepper, title, optional footer CTA.
 */
export default function MoneyFlowShell({
  steps,
  currentStep,
  title,
  subtitle,
  children,
  footer,
  className,
  above,
}: Props) {
  const maxStep = steps[steps.length - 1]?.n ?? 1;

  return (
    <div className={cn("mx-auto w-full max-w-lg space-y-5", className)}>
      {above}

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] overflow-hidden">
        <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-border/80 bg-gradient-to-b from-muted/40 to-card">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-5">
            {steps.map(({ n, label }) => {
              const completed = currentStep > n;
              const active = currentStep === n;
              return (
                <div key={n} className="flex items-center">
                  <div className="flex flex-col items-center gap-1">
                    <motion.div
                      initial={false}
                      animate={{
                        scale: active ? 1.05 : 1,
                        backgroundColor:
                          completed || active
                            ? "hsl(var(--primary))"
                            : "hsl(var(--muted))",
                      }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                        completed || active
                          ? "text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {completed ? (
                          <motion.span
                            key="check"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </motion.span>
                        ) : (
                          <motion.span key="num" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {n}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.div>
                    <span
                      className={cn(
                        "text-[10px] sm:text-xs font-medium",
                        active || completed ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {n < maxStep && (
                    <motion.div
                      initial={false}
                      animate={{
                        backgroundColor:
                          currentStep > n ? "hsl(var(--primary))" : "hsl(var(--muted))",
                      }}
                      className="w-8 sm:w-12 h-0.5 mb-4 mx-0.5 rounded-full"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="text-center sm:text-left">
            <h2 className="text-xl sm:text-2xl font-display font-bold tracking-tight">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5">{children}</div>

        {footer ? (
          <div className="px-4 sm:px-6 pb-5 pt-0 space-y-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
