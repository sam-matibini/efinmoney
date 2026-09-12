/** Helpers for Plaid live balances shown on the Bank tab. */

export const PLAID_BALANCE_STALE_MS = 5 * 60 * 1000;
export const PLAID_BALANCE_MIN_REFRESH_MS = 60 * 1000;

export function asMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isPlaidBalanceStale(
  updatedAt: string | null | undefined,
  staleMs = PLAID_BALANCE_STALE_MS,
  now = Date.now(),
): boolean {
  if (!updatedAt) return true;
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return now - ts > staleMs;
}

export function formatBalanceAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "not fetched yet";
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "not fetched yet";
  if (ms < 45_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function preferredLiveBalance(available: unknown, current: unknown): number | null {
  const a = asMoney(available);
  if (a != null) return a;
  return asMoney(current);
}

export function formatLiveBankLine(
  available: unknown,
  current: unknown,
  currency: string | null | undefined,
  updatedAt: string | null | undefined,
  fmt: (n: number, ccy: string) => string,
): string | null {
  const n = preferredLiveBalance(available, current);
  if (n == null) return null;
  const ccy = (currency || "CAD").toUpperCase();
  const label = asMoney(available) != null ? "Bank available" : "Bank balance";
  return `${label} · ${fmt(n, ccy)} · updated ${formatBalanceAge(updatedAt)}`;
}
