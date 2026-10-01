import { useEffect, useId, useState } from "react";
import { useDialogA11y } from "@/components/dashboard/redesign/useDialogA11y";
import { useEfmToast } from "@/components/dashboard/redesign/ToastProvider";

type BudgetModalProps = {
  open: boolean;
  initialValue: number | null;
  onClose: () => void;
  onSave: (amount: number) => void;
};

const BudgetModal = ({ open, initialValue, onClose, onSave }: BudgetModalProps) => {
  const titleId = useId();
  const { push } = useEfmToast();
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  const dialogRef = useDialogA11y(open, onClose);

  useEffect(() => {
    if (open) setValue(initialValue ? String(initialValue) : "");
  }, [open, initialValue]);

  if (!open) return null;

  const save = () => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      push("error", "Enter an amount greater than zero.");
      return;
    }
    onSave(amount);
    push("success", "Budget set successfully.");
    onClose();
  };

  return (
    <div className="efm-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="efm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>Set monthly budget</h2>
        <p>Choose the CAD amount you want to track on the dashboard.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="efm-field">
            <label htmlFor="monthly-budget">Amount (CAD)</label>
            <input
              id="monthly-budget"
              className="efm-input"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <div className="efm-actions">
            <button type="button" className="efm-btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="efm-btn-gold">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BudgetModal;
