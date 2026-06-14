import { useRef, useState, type ReactNode } from "react";
import TransactionPinDialog from "@/components/send/TransactionPinDialog";

/**
 * Reusable transaction-PIN gate. Wrap any "send money" action so the user must
 * enter (or first create) their 4-digit PIN before it runs.
 *
 *   const { requirePin, pinGate } = usePinGate();
 *   <Button onClick={() => requirePin(() => doSend(), "₦100.00 NGN")}>Send</Button>
 *   {pinGate}
 */
export function usePinGate() {
  const [open, setOpen] = useState(false);
  const [amountLabel, setAmountLabel] = useState<string | undefined>(undefined);
  const actionRef = useRef<null | (() => void | Promise<void>)>(null);

  const requirePin = (action: () => void | Promise<void>, label?: string) => {
    actionRef.current = action;
    setAmountLabel(label);
    setOpen(true);
  };

  const handleVerified = () => {
    setOpen(false);
    const action = actionRef.current;
    actionRef.current = null;
    if (action) void action();
  };

  const pinGate: ReactNode = (
    <TransactionPinDialog
      open={open}
      onOpenChange={setOpen}
      onVerified={handleVerified}
      amountLabel={amountLabel}
    />
  );

  return { requirePin, pinGate };
}
