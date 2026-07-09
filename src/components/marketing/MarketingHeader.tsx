import { useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";
import { cn } from "@/lib/utils";

export const MARKETING_NAV = [
  { label: "Features", to: "/features" },
  { label: "How it works", to: "/how-it-works" },
  { label: "About", to: "/about" },
];

/**
 * Shared marketing top-nav used by the landing page and the public
 * Features / How it works / About pages.
 *
 * variant="transparent" — overlays the dark hero (landing).
 * variant="solid"       — deep-purple bar for interior marketing pages.
 */
export default function MarketingHeader({ variant = "solid" }: { variant?: "transparent" | "solid" }) {
  const [open, setOpen] = useState(false);
  const transparent = variant === "transparent";

  return (
    <header
      className={cn(
        "top-0 inset-x-0 z-50",
        transparent ? "absolute" : "sticky bg-[hsl(var(--brand-900))] border-b border-white/10",
      )}
    >
      <nav className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="w-9 h-9" />
          <Wordmark className="font-black text-xl tracking-tight" />
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {MARKETING_NAV.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/auth" className="text-sm font-semibold text-white/90 hover:text-white transition-colors px-3 py-2">
            Sign in
          </Link>
          <Link
            to="/auth"
            className="text-sm font-bold bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] px-5 py-2.5 rounded-full transition-all hover:-translate-y-0.5 shadow-cta-amber"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-white p-2 -mr-2"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-[hsl(var(--brand-900))] border-t border-white/10 px-6 py-4 space-y-1">
          {MARKETING_NAV.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="block py-2.5 text-sm font-medium text-white/80 hover:text-white transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-3 mt-2 border-t border-white/10 flex flex-col gap-2">
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="text-center text-sm font-semibold text-white/90 py-2.5 rounded-full border border-white/15"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              onClick={() => setOpen(false)}
              className="text-center text-sm font-bold bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] py-2.5 rounded-full shadow-cta-amber"
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
