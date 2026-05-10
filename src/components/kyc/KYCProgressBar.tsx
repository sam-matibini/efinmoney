import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentStep: 1 | 2 | 3;
  className?: string;
}

const STEPS = [
  { id: 1, label: "Identity" },
  { id: 2, label: "Address" },
  { id: 3, label: "Review" },
];

const KYCProgressBar = ({ currentStep, className }: Props) => {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const done = currentStep > s.id;
          const active = currentStep === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300",
                    done && "bg-primary text-primary-foreground",
                    active && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                    !done && !active && "bg-secondary text-muted-foreground"
                  )}
                >
                  {done ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span
                  className={cn(
                    "text-xs font-medium",
                    (active || done) ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-0.5 mx-2 -mt-6 bg-secondary rounded overflow-hidden">
                  <div
                    className={cn(
                      "h-full bg-primary transition-all duration-500",
                      done ? "w-full" : "w-0"
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default KYCProgressBar;
