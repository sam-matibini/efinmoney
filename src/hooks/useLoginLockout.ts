import { useCallback, useEffect, useState } from "react";

export type LoginKind = "admin" | "customer";

export interface UseLoginLockoutOptions {
  /** Max attempts before lockout (server-side threshold is the source of truth; this is the UI cap). */
  maxAttempts: number;
  /** Audience for the lockout check — passed to the RPC so admin / customer lockouts are tracked separately. */
  kind?: LoginKind;
}

export interface LockoutState {
  lockedUntil: string | null;
  remainingSeconds: number;
}

export interface UseLoginLockoutResult {
  failedAttempts: number;
  attemptsLeft: number;
  showAttemptsWarning: boolean;
  secondsLeft: number;
  isLocked: boolean;
  formatRemaining: (s: number) => string;
  /** Re-check the server for an active lockout (call before each submit). */
  checkLockout: (email: string) => Promise<LockoutState>;
  /** Parse the structured error message returned by signIn and update local state.
   *  Pass `email` so a "locked" error can refetch the exact countdown window. */
  applyError: (message: string, email?: string) => Promise<void>;
  /** Bump the local attempt counter (used when signIn returns a generic error). */
  incrementAttempts: () => void;
  /** Clear all local state (called after a successful sign-in). */
  reset: () => void;
}

const formatRemaining = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec.toString().padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
};

/**
 * Shared state machine for the customer/admin login lockout UI.
 * Each page calls checkLockout() before submit, then hands the returned
 * error to applyError() to update the banner / countdown.
 */
export function useLoginLockout({ maxAttempts, kind = "admin" }: UseLoginLockoutOptions): UseLoginLockoutResult {
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockout, setLockout] = useState<LockoutState>({ lockedUntil: null, remainingSeconds: 0 });
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second so the countdown stays accurate.
  useEffect(() => {
    if (lockout.remainingSeconds <= 0 && !lockout.lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockout.remainingSeconds, lockout.lockedUntil]);

  const secondsLeft = lockout.lockedUntil
    ? Math.max(0, Math.floor((new Date(lockout.lockedUntil).getTime() - now) / 1000))
    : 0;
  const isLocked = secondsLeft > 0;
  const attemptsLeft = Math.max(0, maxAttempts - failedAttempts);
  const showAttemptsWarning = !isLocked && failedAttempts > 0 && attemptsLeft <= 2;

  // Auto-clear when the countdown hits 0.
  useEffect(() => {
    if (secondsLeft === 0 && lockout.lockedUntil) {
      setLockout({ lockedUntil: null, remainingSeconds: 0 });
      setFailedAttempts(0);
    }
  }, [secondsLeft, lockout.lockedUntil]);

  const checkLockout = useCallback(async (_email: string): Promise<LockoutState> => {
    // Lazy import so the hook can be used without the supabase client
    // needing to be on the import path of every consumer.
    const { supabase } = await import("@/integrations/supabase/client");
    try {
      const { data } = await (supabase as any).rpc("check_login_lockout", { p_email: _email, p_kind: kind });
      if (data?.locked) {
        const state = {
          lockedUntil: (data.locked_until as string | null) ?? null,
          remainingSeconds: (data.remaining_seconds as number) ?? 0,
        };
        setLockout(state);
        return state;
      }
    } catch { /* ignore */ }
    setLockout({ lockedUntil: null, remainingSeconds: 0 });
    return { lockedUntil: null, remainingSeconds: 0 };
  }, [kind]);

  const applyError = useCallback(async (message: string, email?: string) => {
    const m = message.match(/(\d+)\s+attempt/i);
    if (m) {
      const remaining = parseInt(m[1], 10);
      setFailedAttempts(Math.max(0, maxAttempts - remaining));
      return;
    }
    if (/locked/i.test(message)) {
      setFailedAttempts(maxAttempts);
      if (email) {
        // Lockout just kicked in — refetch its exact window.
        await checkLockout(email);
      }
    }
  }, [maxAttempts, checkLockout]);

  const incrementAttempts = useCallback(() => {
    setFailedAttempts((n) => Math.min(maxAttempts, n + 1));
  }, [maxAttempts]);

  const reset = useCallback(() => {
    setFailedAttempts(0);
    setLockout({ lockedUntil: null, remainingSeconds: 0 });
  }, []);

  return {
    failedAttempts,
    attemptsLeft,
    showAttemptsWarning,
    secondsLeft,
    isLocked,
    formatRemaining,
    checkLockout,
    applyError,
    incrementAttempts,
    reset,
  };
}
