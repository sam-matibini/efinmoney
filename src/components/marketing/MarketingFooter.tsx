import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Logo, Wordmark } from "@/components/Logo";

const SUPPORT_EMAIL = "support@efin.money";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "How it works", href: "/how-it-works" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Compliance", href: "/compliance" },
    ],
  },
];

export default function MarketingFooter() {
  return (
    <footer className="relative bg-[hsl(var(--brand-900))] text-white/80 overflow-hidden">
      <div className="absolute inset-0 bg-grid-purple opacity-40 pointer-events-none" />
      <div className="absolute -top-32 left-1/4 w-96 h-96 rounded-full bg-[hsl(var(--primary)/0.18)] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 right-1/4 w-96 h-96 rounded-full bg-[hsl(var(--accent-amber)/0.08)] blur-3xl pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--accent-amber))]/50 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 pt-20 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-14 border-b border-white/15">
          {/* Brand */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-2">
              <Logo className="w-10 h-10" />
              <Wordmark className="font-black text-2xl" />
            </div>
            <p className="mt-5 text-sm text-white/70 max-w-sm leading-relaxed">
              The smartest way to move, hold and exchange money across borders. Built for individuals and
              businesses worldwide.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] bg-white/10 border border-white/15 text-white/85">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent-amber))]" />
                MSB Licensed
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.18em] bg-white/10 border border-white/15 text-white/85">
                <Shield className="w-3 h-3 text-[hsl(var(--accent-amber))]" />
                SOC 2 Type II
              </span>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-[hsl(var(--accent-amber))] mb-4">
                {col.title}
              </h4>
              <ul className="space-y-3 text-sm">
                {col.links.map((l) =>
                  l.href.startsWith("/") ? (
                    <li key={l.label}>
                      <Link to={l.href} className="text-white/70 hover:text-white transition-colors">
                        {l.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={l.label}>
                      <a href={l.href} className="text-white/70 hover:text-white transition-colors">
                        {l.label}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs text-white/60">
          <span>© {new Date().getFullYear()} eFinMoney. All rights reserved.</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-white/70 hover:text-white transition-colors">{SUPPORT_EMAIL}</a>
        </div>
      </div>
    </footer>
  );
}
