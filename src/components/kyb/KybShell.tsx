import { ReactNode } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import BackToDashboard from "@/components/layout/BackToDashboard";
import Header from "@/components/layout/Header";
import { cn } from "@/lib/utils";

export const KYB_STEPS = ["Business", "Ownership", "Documents", "Review"] as const;

interface Props {
  step?: 1 | 2 | 3 | 4;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const KybShell = ({ step, title, subtitle, children, footer }: Props) => (
  <div className="min-h-screen bg-background">
    <Header />
    <div className="container max-w-2xl mx-auto px-4 py-8 md:py-12">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <BackToDashboard className="mb-6" />

        {step && (
          <div className="mb-10 flex items-center">
            {KYB_STEPS.map((label, i) => {
              const index = i + 1;
              const done = index < step;
              const active = index === step;
              return (
                <div key={label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                        done && "bg-primary text-primary-foreground",
                        active && "bg-primary/15 text-primary ring-2 ring-primary",
                        !done && !active && "bg-secondary text-muted-foreground"
                      )}
                    >
                      {done ? <Check className="w-4 h-4" /> : index}
                    </div>
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        active ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {label}
                    </span>
                  </div>
                  {index < KYB_STEPS.length && (
                    <div
                      className={cn(
                        "h-0.5 flex-1 mx-2 -mt-5 rounded",
                        done ? "bg-primary" : "bg-secondary"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2 mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm md:text-base">{subtitle}</p>}
        </div>

        <div className="space-y-6">{children}</div>
        {footer && <div className="mt-8">{footer}</div>}
      </motion.div>
    </div>
  </div>
);

export default KybShell;
