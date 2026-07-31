import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Logo, Wordmark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * Branded page shell for confirmation / auth-style screens.
 *
 * Layout (top to bottom):
 *   1. Top bar — deep-navy gradient, eFinMoney logo + wordmark on the
 *      left, optional actions slot on the right.
 *   2. Body — soft slate background with two subtle amber/purple glow
 *      blobs behind the content card. The card is white, rounded,
 *      shadowed, and centred.
 *   3. Footer — small eFinMoney wordmark + copyright.
 *
 * Used for password reset, sign-up confirmation, email verification
 * result, and similar one-shot transactional screens.
 */
export interface BrandedScreenProps {
  children: ReactNode;
  /** Right-side slot in the top bar (e.g. "Back to home" link). */
  topBarAction?: ReactNode;
  /** Optional page title shown above the card (e.g. for marketing pages). */
  pageTitle?: string;
  /** Width of the content card. Default `md` (28rem). */
  cardWidth?: "sm" | "md" | "lg";
  /** Disable the background glow blobs (for dense auth pages). */
  flat?: boolean;
  /**
   * Hide the shell's own top bar — use this when BrandedScreen is
   * mounted inside a page that already provides a header (e.g. the
   * customer-facing Auth.tsx, which wraps every state in its own
   * white header). The branded body + footer still render.
   */
  hideTopBar?: boolean;
}

const CARD_WIDTHS: Record<NonNullable<BrandedScreenProps["cardWidth"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

export function BrandedScreen({
  children,
  topBarAction,
  pageTitle,
  cardWidth = "md",
  flat = false,
  hideTopBar = false,
}: BrandedScreenProps) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-amber-50/40 dark:from-[hsl(var(--brand-900))] dark:via-[hsl(256_55%_10%)] dark:to-[hsl(256_60%_14%)] text-foreground">
      {/* Top bar (hidden when mounted inside a page that provides its own header) */}
      {!hideTopBar && (
        <header className="relative z-10 bg-gradient-to-r from-[hsl(256_65%_10%)] via-[hsl(256_60%_15%)] to-[hsl(256_55%_18%)] text-white">
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group">
              <Logo static className="w-8 h-8 sm:w-9 sm:h-9" />
              <Wordmark className="font-black text-lg sm:text-xl tracking-tight" />
            </Link>
            {topBarAction ? (
              <div className="text-sm text-slate-200">{topBarAction}</div>
            ) : null}
          </div>
        </header>
      )}

      {/* Body */}
      <main className="relative flex-1 flex items-center justify-center px-4 sm:px-6 py-10 sm:py-14 overflow-hidden">
        {!flat && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-amber-400/20 dark:bg-amber-500/15 blur-3xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-[hsl(250_75%_55%)]/15 dark:bg-[hsl(250_75%_55%)]/10 blur-3xl"
            />
          </>
        )}

        <div className={cn("relative w-full", CARD_WIDTHS[cardWidth])}>
          {pageTitle && (
            <h1 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(256_60%_28%)] dark:text-amber-300/80 mb-6">
              {pageTitle}
            </h1>
          )}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[hsl(232_45%_14%)] shadow-xl shadow-slate-900/[0.04] dark:shadow-black/40 overflow-hidden"
          >
            {/* Top accent bar inside the card for visual continuity with the email */}
            <div className="h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400" />
            <div className="p-7 sm:p-9">{children}</div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-5 text-center text-xs text-slate-500 dark:text-slate-400">
        <p>
          <span className="font-semibold text-slate-700 dark:text-amber-300/80">eFinMoney</span>{" "}
          · Cross-border payments, multi-currency wallets
        </p>
        <p className="mt-1 text-slate-400 dark:text-slate-500">
          © {new Date().getFullYear()} eFinMoney. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

/**
 * Big circular icon badge at the top of a confirmation card.
 * Use the `tone` prop to switch the colour family.
 */
export function BrandIconBadge({
  icon,
  tone = "success",
  className,
}: {
  icon: ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  className?: string;
}) {
  const toneClass: Record<typeof tone, string> = {
    success: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-500/30",
    warning: "bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg shadow-amber-500/30",
    danger: "bg-gradient-to-br from-rose-500 to-rose-700 text-white shadow-lg shadow-rose-500/30",
    info: "bg-gradient-to-br from-[hsl(244_75%_57%)] to-[hsl(258_80%_60%)] text-white shadow-lg shadow-[hsl(244_75%_57%)]/30",
    neutral: "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200",
  } as const;
  return (
    <div className={cn("mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full", toneClass[tone], className)}>
      {icon}
    </div>
  );
}

/**
 * Primary branded button — amber gradient with deep-navy text. Used in
 * confirmation screens to make the next-step CTA visually loud.
 */
export function BrandPrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "mt-7 w-full h-12 rounded-full font-bold text-[15px] text-[#0e0a26] inline-flex items-center justify-center gap-2",
        "bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600",
        "shadow-[0_10px_24px_-8px_rgba(245,158,11,0.55),inset_0_1px_0_0_rgba(255,255,255,0.4)]",
        "transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40",
        className,
      )}
    >
      {children}
    </button>
  );
}
