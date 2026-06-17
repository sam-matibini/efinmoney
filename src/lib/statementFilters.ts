import type { StatementRow } from "@/hooks/useStatement";

export interface StatementFilterOptions {
  direction?: "all" | "in" | "out";
  search?: string;
  from?: string;
  to?: string;
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

export const filterStatementRows = (
  rows: StatementRow[],
  { direction = "all", search = "", from = "", to = "" }: StatementFilterOptions,
): StatementRow[] => {
  let items = rows;

  if (direction === "in") items = items.filter((r) => r.moneyIn > 0);
  if (direction === "out") items = items.filter((r) => r.moneyOut > 0);

  if (search.trim()) {
    items = items.filter((r) => matchesStatementSearch(r, search));
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

export const hasStatementFilters = (opts: StatementFilterOptions): boolean =>
  !!(opts.search?.trim() || opts.from || opts.to || (opts.direction && opts.direction !== "all"));
