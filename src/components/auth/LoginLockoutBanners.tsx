import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Clock, KeyRound } from "lucide-react";

export interface LoginLockoutBannersProps {
  isLocked: boolean;
  secondsLeft: number;
  formatRemaining: (s: number) => string;
  attemptsLeft: number;
  showAttemptsWarning: boolean;
  /** Total attempts allowed (e.g. 5 or 10) — shown in the warning copy. */
  maxAttempts: number;
  /** Lockout duration in human terms, e.g. "2 hours" — shown in the warning copy. */
  lockoutDuration: string;
}

export function LoginLockoutBanners({
  isLocked,
  secondsLeft,
  formatRemaining,
  attemptsLeft,
  showAttemptsWarning,
  maxAttempts: _maxAttempts,
  lockoutDuration,
}: LoginLockoutBannersProps) {
  return (
    <>
      {isLocked && (
        <Alert variant="destructive" className="mb-4 border-destructive/50 bg-destructive/10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Account locked</AlertTitle>
          <AlertDescription className="flex items-center gap-2 text-sm">
            <Clock className="h-3.5 w-3.5" />
            Too many failed sign-in attempts. Try again in <strong>{formatRemaining(secondsLeft)}</strong>.
          </AlertDescription>
        </Alert>
      )}

      {showAttemptsWarning && (
        <Alert className="mb-4 border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <KeyRound className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>{attemptsLeft}</strong> attempt{attemptsLeft === 1 ? "" : "s"} left before your account is locked for {lockoutDuration}.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
