import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SetBudgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAmount?: number;
  onSave: (amount: number) => Promise<unknown>;
}

/** Set Budget modal: CAD amount, positive-number validation, Save / Cancel. */
export default function SetBudgetModal({ open, onOpenChange, initialAmount, onSave }: SetBudgetModalProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialAmount ? String(initialAmount) : "");
      setError(null);
    }
  }, [open, initialAmount]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(value.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setSaving(true);
    try {
      await onSave(amount);
      onOpenChange(false);
      toast.success("Budget set successfully.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your budget.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-black/60 backdrop-blur-[8px]"
        className="max-w-[400px] rounded-[var(--radius-lg)] border-[var(--color-border)] bg-[var(--color-bg-card)] p-8 text-[var(--color-text-primary)]"
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--font-size-lg)] font-bold">Set monthly budget</DialogTitle>
          <DialogDescription className="text-[var(--color-text-muted)]">
            We'll track how much you send each month against this amount.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <label htmlFor="budget-amount" className="text-sm font-medium text-[var(--color-text-label)]">
              Amount (CAD)
            </label>
            <div className="flex items-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-primary)] focus-within:ring-2 focus-within:ring-[var(--color-accent-gold)]">
              <span className="pl-4 pr-2 text-[var(--color-text-muted)]">C$</span>
              <input
                id="budget-amount"
                inputMode="decimal"
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value.replace(/[^\d.,]/g, ""));
                  setError(null);
                }}
                placeholder="0.00"
                aria-invalid={!!error}
                aria-describedby={error ? "budget-error" : undefined}
                className="h-12 w-full bg-transparent pr-4 text-lg font-semibold text-white outline-none placeholder:text-[var(--color-text-muted)]"
              />
            </div>
            {error && (
              <p id="budget-error" className="text-sm text-[var(--color-danger)]">
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 h-11 rounded-[var(--radius-md)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-label)] hover:bg-white/[0.06] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-gold)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-11 rounded-[var(--radius-md)] bg-[var(--color-accent-gold)] text-sm font-bold text-[var(--color-bg-primary)] hover:brightness-110 disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
