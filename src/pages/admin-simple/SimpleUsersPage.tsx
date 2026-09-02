import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  account_status: string | null;
  kyc_status: string;
  kyc_tier: string;
  created_at: string;
  avatar_url?: string | null;
};

function displayName(fullName: string | null, email: string | null) {
  if (fullName?.trim()) return fullName;
  if (email) {
    const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
    if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return "No name";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
}

function KycPill({ status, tier }: { status: string; tier: string }) {
  const v = (status || "").toLowerCase();
  const ok = v === "approved" || v === "verified";
  const bad = v === "rejected";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize tracking-wide",
        ok && "bg-[hsl(var(--brand-900))] text-amber-300",
        bad && "bg-red-100 text-red-700",
        !ok && !bad && "bg-amber-100 text-amber-900",
      )}
    >
      {(status || "—").replace(/_/g, " ")}
      {tier ? ` · ${tier.replace(/_/g, " ")}` : ""}
    </span>
  );
}

function StatusPill({ status }: { status: string | null }) {
  const v = (status || "").toLowerCase();
  const active = v === "active";
  const bad = v === "suspended" || v === "closed";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        active && "bg-emerald-100 text-emerald-800",
        bad && "bg-red-100 text-red-700",
        !active && !bad && "bg-slate-100 text-slate-600",
      )}
    >
      {(status || "—").replace(/_/g, " ")}
    </span>
  );
}

export default function SimpleUsersPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["simple-admin-users"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, account_status, kyc_status, kyc_tier, created_at, avatar_url")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = `${r.full_name || ""} ${r.email || ""} ${r.user_id}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  return (
    <div className="space-y-8">
      {/* Page hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--brand-900))] via-[hsl(var(--brand-800))] to-[hsl(256_60%_28%)] px-6 py-8 sm:px-8 text-white shadow-card-purple">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[hsl(var(--accent-amber)/0.25)] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-56 rounded-full bg-[hsl(var(--primary)/0.35)] blur-3xl"
        />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300/90">
          Customer 360
        </p>
        <h1 className="relative mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Users
        </h1>
        <p className="relative mt-2 max-w-xl text-sm text-white/70">
          Open anyone to see wallets, every send &amp; top-up by provider, KYC, and support — in one place.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-lg">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--brand-700)/0.55)]" />
        <input
          className="w-full rounded-full border border-[hsl(var(--brand-900)/0.1)] bg-white py-3 pl-11 pr-4 text-sm shadow-sm outline-none ring-amber-400/0 transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30 placeholder:text-slate-400"
          placeholder="Search name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-[hsl(var(--brand-900)/0.08)] bg-white shadow-sm">
        {isLoading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No users match.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const name = displayName(r.full_name, r.email);
              return (
                <li key={r.user_id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/simple/users/${r.user_id}`)}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-gradient-to-r hover:from-amber-50/80 hover:to-transparent sm:px-5"
                  >
                    {r.avatar_url ? (
                      <img
                        src={r.avatar_url}
                        alt=""
                        className="h-11 w-11 rounded-full object-cover ring-2 ring-amber-200/80"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[hsl(var(--brand-800))] to-[hsl(var(--primary))] font-display text-sm font-semibold text-amber-200">
                        {initials(name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display font-semibold text-[hsl(var(--brand-900))] truncate">
                          {name}
                        </span>
                        <KycPill status={r.kyc_status} tier={r.kyc_tier} />
                        <StatusPill status={r.account_status} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-500">{r.email || "—"}</p>
                    </div>
                    <div className="hidden sm:block text-right shrink-0">
                      <p className="text-[11px] uppercase tracking-wider text-slate-400">Joined</p>
                      <p className="text-sm font-medium text-slate-600">
                        {format(new Date(r.created_at), "dd MMM yyyy")}
                      </p>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-amber-500/70" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-center text-xs text-slate-400">
        {filtered.length} shown · newest 500
      </p>
    </div>
  );
}
