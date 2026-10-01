import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDialogA11y } from "@/components/dashboard/redesign/useDialogA11y";
import { useEfmToast } from "@/components/dashboard/redesign/ToastProvider";
import { saveSendHandoff } from "@/lib/sendHandoff";

export type QuickActionType = "send" | "topup" | "request" | "exchange";

const TITLES: Record<QuickActionType, string> = {
  send: "Send Money",
  topup: "Top Up",
  request: "Request",
  exchange: "Exchange",
};

const CURRENCIES = ["CAD", "USD", "EUR", "GBP", "NGN", "UGX", "KES"];

type QuickActionDrawerProps = {
  action: QuickActionType | null;
  currency: string;
  onClose: () => void;
};

const QuickActionDrawer = ({ action, currency, onClose }: QuickActionDrawerProps) => {
  const titleId = useId();
  const navigate = useNavigate();
  const { push } = useEfmToast();
  const open = action !== null;
  const dialogRef = useDialogA11y(open, onClose);
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [recipient, setRecipient] = useState("");
  const [fromCurrency, setFromCurrency] = useState(currency || "CAD");
  const [toCurrency, setToCurrency] = useState("USD");

  useEffect(() => {
    if (!open) return;
    setStep("form");
    setAmount("");
    setDescription("");
    setRecipient("");
    setFromCurrency(currency || "CAD");
    setToCurrency(currency === "USD" ? "CAD" : "USD");
  }, [open, action, currency]);

  if (!action) return null;

  const needsRecipient = action === "send" || action === "request";
  const amountNumber = Number(amount);

  const continueForm = () => {
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      push("error", "Enter an amount greater than zero.");
      return;
    }
    if (needsRecipient && !recipient.trim()) {
      push("error", "Enter a recipient.");
      return;
    }
    if (action === "exchange" && fromCurrency === toCurrency) {
      push("error", "Choose two different currencies.");
      return;
    }
    setStep("confirm");
  };

  const confirm = () => {
    if (action === "send") {
      saveSendHandoff({
        amount: amountNumber,
        from: fromCurrency,
        to: "",
        fundingSource: "wallet",
      });
      navigate("/send?quick=1");
      push("success", "Send details saved. Finish the transfer on the next screen.");
    } else if (action === "topup") {
      const params = new URLSearchParams({ amount: String(amountNumber), currency: fromCurrency });
      navigate(`/wallet/topup?${params.toString()}`);
      push("success", "Top up details saved. Finish adding money on the next screen.");
    } else if (action === "request") {
      navigate("/request-money", {
        state: { amount: amountNumber, description: description.trim(), recipient: recipient.trim() },
      });
      push("success", "Request details saved. Finish the request on the next screen.");
    } else {
      const params = new URLSearchParams({ from: fromCurrency, to: toCurrency, amount: String(amountNumber) });
      navigate(`/exchange?${params.toString()}`);
      push("success", "Exchange details saved. Finish the exchange on the next screen.");
    }
    onClose();
  };

  return (
    <div className="efm-overlay" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="efm-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{TITLES[action]}</h2>
        {step === "form" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              continueForm();
            }}
          >
            <div className="efm-field">
              <label htmlFor="qa-amount">Amount ({action === "exchange" ? fromCurrency : currency || "CAD"})</label>
              <input
                id="qa-amount"
                className="efm-input"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            {action === "exchange" && (
              <>
                <div className="efm-field">
                  <label htmlFor="qa-from">From</label>
                  <select id="qa-from" className="efm-input" value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value)}>
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div className="efm-field">
                  <label htmlFor="qa-to">To</label>
                  <select id="qa-to" className="efm-input" value={toCurrency} onChange={(event) => setToCurrency(event.target.value)}>
                    {CURRENCIES.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {needsRecipient && (
              <div className="efm-field">
                <label htmlFor="qa-recipient">Recipient</label>
                <input
                  id="qa-recipient"
                  className="efm-input"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder="Name, email, or eFin tag"
                />
              </div>
            )}
            <div className="efm-field">
              <label htmlFor="qa-description">Description / reference</label>
              <input
                id="qa-description"
                className="efm-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional note"
              />
            </div>
            <div className="efm-actions">
              <button type="button" className="efm-btn-outline" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="efm-btn-gold">
                Continue
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p className="efm-help">Confirm these details. The existing {TITLES[action].toLowerCase()} flow completes the transfer.</p>
            <dl className="efm-summary">
              <div>
                <dt>Amount</dt>
                <dd>{amountNumber.toFixed(2)} {action === "exchange" ? fromCurrency : currency || "CAD"}</dd>
              </div>
              {action === "exchange" && (
                <div>
                  <dt>Pair</dt>
                  <dd>{fromCurrency} → {toCurrency}</dd>
                </div>
              )}
              {needsRecipient && (
                <div>
                  <dt>Recipient</dt>
                  <dd>{recipient.trim()}</dd>
                </div>
              )}
              {description.trim() && (
                <div>
                  <dt>Reference</dt>
                  <dd>{description.trim()}</dd>
                </div>
              )}
            </dl>
            <div className="efm-actions">
              <button type="button" className="efm-btn-outline" onClick={() => setStep("form")}>
                Back
              </button>
              <button type="button" className="efm-btn-gold" onClick={confirm}>
                Confirm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickActionDrawer;
