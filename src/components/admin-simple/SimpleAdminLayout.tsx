import { ReactNode } from "react";
import { NavLink, Link, Outlet } from "react-router-dom";
import { Users, Tags, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Logo, Wordmark } from "@/components/Logo";

const NAV = [
  { to: "/admin/simple/users", label: "Users", icon: Users },
  { to: "/admin/simple/rates", label: "Partners & Rates", icon: Tags },
] as const;

export default function SimpleAdminLayout({ children }: { children?: ReactNode }) {
  const { admin } = useAdminAuth();

  return (
    <div className="min-h-screen flex flex-col font-body text-foreground bg-gradient-to-br from-slate-50 via-white to-amber-50/50 dark:from-[hsl(var(--brand-900))] dark:via-[hsl(256_55%_10%)] dark:to-[hsl(256_60%_14%)]">
      {/* Brand header — same language as client auth / marketing */}
      <header className="relative z-40 sticky top-0 text-white bg-gradient-to-r from-[hsl(256_65%_10%)] via-[hsl(256_60%_15%)] to-[hsl(256_55%_18%)] shadow-card-purple">
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-amber-400 via-[hsl(var(--accent-amber))] to-amber-400" />
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-5 px-4 sm:px-6">
          <Link to="/admin/simple" className="flex items-center gap-2.5 shrink-0 group">
            <Logo className="w-9 h-9" static />
            <div className="hidden sm:flex flex-col leading-none">
              <Wordmark subtle className="font-display text-lg font-semibold" />
              <span className="text-[10px] uppercase tracking-[0.18em] text-white/55 mt-0.5">
                Ops desk
              </span>
            </div>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all",
                    isActive
                      ? "bg-[hsl(var(--accent-amber))] text-[hsl(var(--brand-900))] shadow-cta-amber"
                      : "text-white/70 hover:text-white hover:bg-white/10",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {admin && (
              <div className="hidden md:flex flex-col items-end leading-tight">
                <span className="text-sm text-white/90">{admin.full_name || admin.email}</span>
                <span className="text-[10px] uppercase tracking-wider text-amber-300/90">
                  {(admin.role || "").replace(/_/g, " ")}
                </span>
              </div>
            )}
            <Link
              to="/admin/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/15 hover:border-amber-400/40 transition-colors"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Classic
            </Link>
          </div>
        </div>
      </header>

      <div className="relative flex-1">
        {/* Soft brand glow blobs (client BrandedScreen pattern) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[hsl(var(--primary)/0.12)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-40 -left-20 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl"
        />

        <main className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          {children ?? <Outlet />}
        </main>
      </div>

      <footer className="relative border-t border-[hsl(var(--brand-900)/0.08)] bg-white/60 backdrop-blur-sm dark:bg-[hsl(var(--brand-900)/0.4)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6 text-xs text-[hsl(230_12%_45%)]">
          <span className="inline-flex items-center gap-1.5">
            <Wordmark subtle className="text-xs font-semibold" />
            <span>· Simple Ops — same live data as Classic</span>
          </span>
          <Link
            to="/admin/dashboard"
            className="text-[hsl(var(--brand-700))] hover:text-[hsl(var(--accent-amber))] underline-offset-2 hover:underline"
          >
            Open Classic admin
          </Link>
        </div>
      </footer>
    </div>
  );
}
