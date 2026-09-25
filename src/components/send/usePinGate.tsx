import { useRef, useState, type ReactNode } from "react";
import TransactionPinDialog from "@/components/send/TransactionPinDialog";

/**
 * Reusable transaction-PIN gate. Wrap any "send money" action so the user must
 * enter (or first create) their 4-digit PIN before it runs.
 *
 *   const { requirePin, pinGate } = usePinGate();
 *   <Button onClick={() => requirePin((pin) => doSend(), "₦100.00 NGN")}>Send</Button>
 *   {pinGate}
 */
export function usePinGate() {
  const [open, setOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [amountLabel, setAmountLabel] = useState<string | undefined>(undefined);
  const [verifyDescription, setVerifyDescription] = useState<string | undefined>(undefined);
  const [processingLabel, setProcessingLabel] = useState("Processing your transfer…");
  const actionRef = useRef<null | ((pin: string) => void | Promise<void>)>(null);

  const requirePin = (
    action: (pin: string) => void | Promise<void>,
    label?: string,
    description?: string,
    opts?: { processingLabel?: string },
  ) => {
    actionRef.current = action;
    setAmountLabel(label);
    setVerifyDescription(description);
    setProcessingLabel(opts?.processingLabel || "Processing your transfer…");
    setProcessing(false);
    setOpen(true);
  };

  const handleVerified = async (pin: string) => {
    const action = actionRef.current;
    actionRef.current = null;
    setProcessing(true);
    try {
      if (action) await action(pin);
    } finally {
      setProcessing(false);
      setOpen(false);
    }
  };

  const pinGate: ReactNode = (
    <TransactionPinDialog
      open={open}
      onOpenChange={(o) => {
        if (!processing) setOpen(o);
      }}
      onVerified={handleVerified}
      amountLabel={amountLabel}
      verifyDescription={verifyDescription}
      processing={processing}
      processingLabel={processingLabel}
    />
  );

  return { requirePin, pinGate };
}
