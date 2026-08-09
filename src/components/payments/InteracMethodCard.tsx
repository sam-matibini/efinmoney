import { cn } from "@/lib/utils";
import { Landmark } from "lucide-react";

interface Props {
  selected: boolean;
  onSelect: () => void;
}

/** First-class Interac e-Transfer tile in the checkout method grid. */
export default function InteracMethodCard({ selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
        selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/50",
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Landmark className="h-5 w-5 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Interac e-Transfer</span>
        <span className="block text-xs text-muted-foreground">
          Pay securely from your Canadian bank account
        </span>
      </span>
    </button>
  );
}
