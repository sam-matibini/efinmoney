import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, Lock, Loader2, Delete } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Mode = "loading" | "set" | "set-confirm" | "verify" | "locked";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the PIN is successfully set or verified. */
  onVerified: () => void;
  /** Optional context shown in the header (e.g. amount being sent). */
  amountLabel?: string;
}

const PIN_LENGTH = 4;

/**
 * Secure transaction PIN gate. Decides on open whether the user needs to
 * create a PIN (first send) or enter their existing one, and only calls
 * onVerified() once the server confirms the PIN.
 */
const TransactionPinDialog = ({ open, onOpenChange, onVerified, amountLabel }: Props) => {
  const [mode, setMode] = useState<Mode>("loading");
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const shakeRef = useRef(0);
  const [shakeKey, setShakeKey] = useState(0);
  const submitLockRef = useRef(false);
  const completedRef = useRef(false);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const reset = useCallback(() => {
    setPin("");
    setFirstPin("");
    setError(null);
    submitLockRef.current = false;
    completedRef.current = false;
  }, []);

  // On open, find out if a PIN already exists.
  useEffect(() => {
    if (!open) return;
    reset();
    setMode("loading");
    (async () => {
      const { data, error: rpcErr } = await supabase.rpc("has_transaction_pin" as any);
      if (rpcErr) {
        toast.error("Could not check your security settings. Please try again.");
        onOpenChange(false);
        return;
      }
      setMode(data ? "verify" : "set");
    })();
  }, [open, reset, onOpenChange]);

  const triggerShake = () => {
    shakeRef.current += 1;
    setShakeKey(shakeRef.current);
  };

  const finishVerified = (opts?: { created?: boolean }) => {
    if (completedRef.current) return;
    completedRef.current = true;
    setPin("");
    if (opts?.created) {
      toast.success("Transaction PIN created");
    }
    onVerifiedRef.current();
  };

  const submitSet = async (finalPin: string) => {
    if (submitLockRef.current || busy || completedRef.current) return;
    submitLockRef.current = true;
    setBusy(true);
    setError(null);
    setPin("");
    const { data, error: rpcErr } = await supabase.rpc("set_transaction_pin" as any, { p_pin: finalPin });
    setBusy(false);
    if (rpcErr || !data) {
      submitLockRef.current = false;
      setError(rpcErr?.message?.includes("Not authenticated")
        ? "Session expired — please sign in again."
        : "Couldn't save your PIN. Please try again.");
      triggerShake();
      setMode("set");
      setFirstPin("");
      return;
    }
    finishVerified({ created: true });
  };

  const submitVerify = async (finalPin: string) => {
    if (submitLockRef.current || busy || completedRef.current) return;
    submitLockRef.current = true;
    setBusy(true);
    setError(null);
    setPin("");
    const { data, error: rpcErr } = await supabase.rpc("verify_transaction_pin" as any, { p_pin: finalPin });
    setBusy(false);
    const res = (data ?? {}) as {
      ok?: boolean; locked?: boolean; no_pin?: boolean;
      attempts_left?: number; locked_until?: string;
    };
    if (rpcErr) {
      submitLockRef.current = false;
      setError("Verification failed. Please try again.");
      triggerShake();
      return;
    }
    if (res.ok) {
      finishVerified();
      return;
    }
    submitLockRef.current = false;
    if (res.no_pin) {
      setMode("set");
      setFirstPin("");
      setError("Set up your PIN first");
      return;
    }
    if (res.locked) {
      setLockedUntil(res.locked_until ?? null);
      setMode("locked");
      return;
    }
    setAttemptsLeft(res.attempts_left ?? null);
    setError(
      res.attempts_left != null
        ? `Incorrect PIN — ${res.attempts_left} ${res.attempts_left === 1 ? "try" : "tries"} left`
        : "Incorrect PIN",
    );
    triggerShake();
  };

  // Auto-advance when the PIN reaches full length.
  useEffect(() => {
    if (pin.length !== PIN_LENGTH || busy || submitLockRef.current || completedRef.current) return;
    if (mode === "set") {
      setFirstPin(pin);
      setPin("");
      setMode("set-confirm");
    } else if (mode === "set-confirm") {
      if (pin === firstPin) {
        void submitSet(pin);
      } else {
        setError("PINs don't match — start again");
        triggerShake();
        setPin("");
        setFirstPin("");
        setMode("set");
      }
    } else if (mode === "verify") {
      void submitVerify(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, mode, busy, firstPin]);

  const pressDigit = (d: string) => {
    if (busy || submitLockRef.current || mode === "locked" || mode === "loading") return;
    setError(null);
    setPin((p) => (p.length < PIN_LENGTH ? p + d : p));
  };
  const backspace = () => setPin((p) => p.slice(0, -1));

  const title =
    mode === "set" ? "Create a transaction PIN"
    : mode === "set-confirm" ? "Confirm your PIN"
    : mode === "locked" ? "Too many attempts"
    : "Enter your PIN";

  const subtitle =
    mode === "set" ? "Choose a 4-digit PIN you'll use to approve transfers. You only set this once."
    : mode === "set-confirm" ? "Re-enter the 4-digit PIN to confirm."
    : mode === "locked" ? "Your PIN is temporarily locked for security."
    : amountLabel
      ? `Authorize sending ${amountLabel}`
      : "Enter your 4-digit PIN to authorize this transfer.";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy && !completedRef.current) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-sm overflow-hidden">
        <DialogHeader className="items-center text-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18 }}
            className="mx-auto mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 ring-1 ring-primary/30"
          >
            {mode === "locked"
              ? <Lock className="h-7 w-7 text-destructive" />
              : <ShieldCheck className="h-7 w-7 text-primary" />}
          </motion.div>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {mode === "loading" ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mode === "locked" ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Please try again later
            {lockedUntil && (
              <> (around <span className="font-medium text-foreground">
                {new Date(lockedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>)</>
            )}.
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 py-2">
            {/* PIN dots */}
            <motion.div
              key={shakeKey}
              animate={shakeKey ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
              transition={{ duration: 0.45 }}
              className="flex items-center gap-4"
            >
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const filled = i < pin.length;
                return (
                  <motion.div
                    key={i}
                    animate={filled ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                    transition={{ duration: 0.25 }}
                    className={`h-4 w-4 rounded-full border-2 transition-colors ${
                      filled
                        ? error ? "border-destructive bg-destructive" : "border-primary bg-primary"
                        : "border-muted-foreground/40 bg-transparent"
                    }`}
                  />
                );
              })}
            </motion.div>

            <div className="h-5">
              <AnimatePresence mode="wait">
                {busy ? (
                  <motion.span
                    key="busy"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                  </motion.span>
                ) : error ? (
                  <motion.span
                    key="err"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="text-sm font-medium text-destructive"
                  >
                    {error}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <KeypadButton key={d} onClick={() => pressDigit(d)} disabled={busy}>
                  {d}
                </KeypadButton>
              ))}
              <div />
              <KeypadButton onClick={() => pressDigit("0")} disabled={busy}>0</KeypadButton>
              <KeypadButton onClick={backspace} disabled={busy || pin.length === 0} aria-label="Delete">
                <Delete className="h-5 w-5" />
              </KeypadButton>
            </div>

            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> Encrypted &amp; never stored in plain text
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const KeypadButton = ({
  children, onClick, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <motion.button
    type="button"
    whileTap={{ scale: 0.9 }}
    whileHover={{ scale: 1.05 }}
    onClick={onClick}
    disabled={disabled}
    className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/40 text-xl font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-40"
    {...(rest as Record<string, unknown>)}
  >
    {children}
  </motion.button>
);

export default TransactionPinDialog;
