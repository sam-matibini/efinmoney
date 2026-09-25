import {
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import type { StatementRow } from "@/hooks/useStatement";

export type DatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export type StatementSortKey =
  | "date"
  | "description"
  | "reference"
  | "payee"
  | "purpose"
  | "status"
  | "moneyOut"
  | "moneyIn";

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Previous week" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Previous month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_year", label: "This year" },
  { id: "custom", label: "Custom range" },
];

export const STATUS_FILTERS = [
  { id: "all", label: "Any status" },
  { id: "completed", label: "Completed" },
  { id: "pending", label: "Pending" },
  { id: "processing", label: "Processing" },
  { id: "failed", label: "Failed" },
  { id: "reversed", label: "Reversed" },
] as const;

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const week = { weekStartsOn: 1 as const };

export function rangeForPreset(preset: DatePreset, now = new Date()): { from: string; to: string } {
  if (preset === "all" || preset === "custom") return { from: "", to: "" };
  if (preset === "today") return { from: iso(now), to: iso(now) };
  if (preset === "yesterday") {
    const d = subDays(now, 1);
    return { from: iso(d), to: iso(d) };
  }
  if (preset === "this_week") return { from: iso(startOfWeek(now, week)), to: iso(endOfWeek(now, week)) };
  if (preset === "last_week") {
    const d = subWeeks(now, 1);
    return { from: iso(startOfWeek(d, week)), to: iso(endOfWeek(d, week)) };
  }
  if (preset === "this_month") return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
  if (preset === "last_month") {
    const d = subMonths(now, 1);
    return { from: iso(startOfMonth(d)), to: iso(endOfMonth(d)) };
  }
  if (preset === "this_quarter") return { from: iso(startOfQuarter(now)), to: iso(endOfQuarter(now)) };
  return { from: iso(startOfYear(now)), to: iso(endOfYear(now)) };
}

export function presetLabel(preset: DatePreset, from: string, to: string): string {
  if (preset === "custom" && (from || to)) {
    return `${from || "Start"} – ${to || "Today"}`;
  }
  return DATE_PRESETS.find((p) => p.id === preset)?.label ?? "All dates";
}

export interface StatementFilterOptions {
  direction?: "all" | "in" | "out";
  search?: string;
  from?: string;
  to?: string;
  status?: string;
  purpose?: string;
}

export interface StatementSort {
  key: StatementSortKey;
  dir: "asc" | "desc";
}

const safe = (v: unknown) => (v == null ? "" : String(v));

/** Flatten row fields into a lowercase haystack for client-side search. */
export const statementSearchText = (row: StatementRow): string => {
  const refBare = row.reference.replace(/^EFM-/i, "");
  return [
    row.description,
    row.payee,
    row.reference,
    refBare,
    row.purpose,
    row.currency,
    row.status,
    row.moneyIn > 0 ? row.moneyIn.toFixed(2) : "",
    row.moneyOut > 0 ? row.moneyOut.toFixed(2) : "",
  ]
    .map(safe)
    .join(" ")
    .toLowerCase();
};

export const matchesStatementSearch = (row: StatementRow, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = statementSearchText(row);
  if (haystack.includes(q)) return true;

  const qBare = q.replace(/^efm-/, "");
  if (qBare !== q && haystack.includes(qBare)) return true;

  const qNum = q.replace(/[^\d.]/g, "");
  if (qNum.length >= 2) {
    if (row.moneyIn > 0 && row.moneyIn.toFixed(2).includes(qNum)) return true;
    if (row.moneyOut > 0 && row.moneyOut.toFixed(2).includes(qNum)) return true;
  }

  return false;
};

const pendingStatuses = new Set(["funded", "pending_liquidity", "pending_ops", "initiated"]);

export const filterStatementRows = (
  rows: StatementRow[],
  { direction = "all", search = "", from = "", to = "", status = "all", purpose = "" }: StatementFilterOptions,
): StatementRow[] => {
  let items = rows;

  if (direction === "in") items = items.filter((r) => r.moneyIn > 0);
  if (direction === "out") items = items.filter((r) => r.moneyOut > 0);

  if (search.trim()) {
    items = items.filter((r) => matchesStatementSearch(r, search));
  }

  if (status && status !== "all") {
    items = items.filter((r) => {
      if (status === "pending") return pendingStatuses.has(r.status);
      return r.status === status;
    });
  }

  if (purpose.trim()) {
    const q = purpose.trim().toLowerCase();
    items = items.filter((r) => r.purpose.toLowerCase().includes(q));
  }

  if (from) {
    const fromTs = new Date(from).getTime();
    items = items.filter((r) => new Date(r.date).getTime() >= fromTs);
  }

  if (to) {
    const toTs = new Date(`${to}T23:59:59`).getTime();
    items = items.filter((r) => new Date(r.date).getTime() <= toTs);
  }

  return items;
};

export const sortStatementRows = (rows: StatementRow[], sort: StatementSort): StatementRow[] => {
  const dir = sort.dir === "asc" ? 1 : -1;
  const text = (v: string) => v.toLowerCase();
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (sort.key) {
      case "date":
        cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
        break;
      case "description":
        cmp = text(a.description).localeCompare(text(b.description));
        break;
      case "reference":
        cmp = text(a.reference).localeCompare(text(b.reference));
        break;
      case "payee":
        cmp = text(a.payee).localeCompare(text(b.payee));
        break;
      case "purpose":
        cmp = text(a.purpose).localeCompare(text(b.purpose));
        break;
      case "status":
        cmp = text(a.status).localeCompare(text(b.status));
        break;
      case "moneyOut":
        cmp = a.moneyOut - b.moneyOut;
        break;
      case "moneyIn":
        cmp = a.moneyIn - b.moneyIn;
        break;
    }
    return cmp * dir;
  });
};

export const hasStatementFilters = (opts: StatementFilterOptions): boolean =>
  !!(
    opts.search?.trim()
    || opts.from
    || opts.to
    || opts.purpose?.trim()
    || (opts.status && opts.status !== "all")
    || (opts.direction && opts.direction !== "all")
  );
