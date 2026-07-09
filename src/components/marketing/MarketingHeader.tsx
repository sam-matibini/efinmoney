import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Menu, X, ChevronDown, Wallet, Send, Smartphone, Landmark, Repeat, CreditCard, Receipt, Building2,
} from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/** Feature categories shown in the "Features" dropdown — each jumps to its
 *  matching section on the /features page. */
const FEATURE_ITEMS = [
  { icon: Wallet, label: "Multi-currency wallets", to: "/features#wallets" },
  { icon: Send, label: "Send money", to: "/features#send" },
  { icon: Smartphone, label: "Mobile money", to: "/features#mobile-money" },
  { icon: Landmark, label: "Canada & Interac", to: "/features#canada" },
  { icon: Repeat, label: "Currency exchange", to: "/features#exchange" },
  { icon: CreditCard, label: "Cards", to: "/features#cards" },
  { icon: Receipt, label: "Bill payments", to: "/features#bills" },
  { icon: Building2, label: "For business", to: "/features#business" },
];

/**
 * Shared marketing top-nav used by the landing page and the public
 * Features / How it works / About pages.
 *
 * variant="transparent" — overlays the dark hero (landing).
 * variant="solid"       — deep-purple bar for interior marketing pages.
 */
export default function MarketingHeader({ variant = "solid" }: { variant?: "transparent" | "solid" }) {
  const [open, setOpen] = useState(false); // mobile menu
  const [mobileFeatures, setMobileFeatures] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false); // desktop dropdown
  const featuresRef = useRef<HTMLDivElement>(null);
  const transparent = variant === "transparent";

  // Close the desktop dropdown on outside click / Escape.
  useEffect(() => {
    if (!featuresOpen) return;
    const onDown = (e: MouseEvent) => {
      if (featuresRef.current && !featuresRef.current.contains(e.target as Node)) setFeaturesOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFeaturesOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [featuresOpen]);

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
          {/* Features dropdown */}
          <div
            ref={featuresRef}
            className="relative"
            onMouseEnter={() => setFeaturesOpen(true)}
            onMouseLeave={() => setFeaturesOpen(false)}
          >
            <button
              type="button"
              onClick={() => setFeaturesOpen((o) => !o)}
              aria-expanded={featuresOpen}
              className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white transition-colors"
            >
              Features
              <ChevronDown className={cn("w-4 h-4 transition-transform", featuresOpen && "rotate-180")} />
            </button>

            {featuresOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3">
                <div className="w-[420px] rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-2 grid grid-cols-2 gap-1">
                  {FEATURE_ITEMS.map((f) => (
                    <Link
                      key={f.to}
                      to={f.to}
                      onClick={() => setFeaturesOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 hover:bg-[hsl(var(--accent))]/60 transition-colors group"
                    >
                      <span className="w-8 h-8 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--brand-700))] flex items-center justify-center shrink-0 group-hover:bg-[hsl(var(--brand-900))] group-hover:text-white transition-colors">
                        <f.icon className="w-4 h-4" />
                      </span>
                      <span className="text-sm font-semibold text-[hsl(var(--brand-900))]">{f.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Link to="/how-it-works" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            How it works
          </Link>
          <Link to="/about" className="text-sm font-medium text-white/70 hover:text-white transition-colors">
            About
          </Link>
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
          {/* Features (expandable) */}
          <button
            onClick={() => setMobileFeatures((o) => !o)}
            aria-expanded={mobileFeatures}
            className="w-full flex items-center justify-between py-2.5 text-sm font-medium text-white/80 hover:text-white transition-colors"
          >
            Features
            <ChevronDown className={cn("w-4 h-4 transition-transform", mobileFeatures && "rotate-180")} />
          </button>
          {mobileFeatures && (
            <div className="pl-2 pb-2 space-y-0.5">
              {FEATURE_ITEMS.map((f) => (
                <Link
                  key={f.to}
                  to={f.to}
                  onClick={() => { setOpen(false); setMobileFeatures(false); }}
                  className="flex items-center gap-2.5 py-2 text-sm text-white/70 hover:text-white transition-colors"
                >
                  <f.icon className="w-4 h-4 text-[hsl(var(--accent-amber))]" />
                  {f.label}
                </Link>
              ))}
            </div>
          )}

          <Link to="/how-it-works" onClick={() => setOpen(false)} className="block py-2.5 text-sm font-medium text-white/80 hover:text-white transition-colors">
            How it works
          </Link>
          <Link to="/about" onClick={() => setOpen(false)} className="block py-2.5 text-sm font-medium text-white/80 hover:text-white transition-colors">
            About
          </Link>

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
