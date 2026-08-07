// Shared list-page controls for admin tables: sortable headers, active filter
// chips and CSV export. Mirrors the pattern established on the Users page.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TableHead } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, ChevronsUpDown, X } from "lucide-react";
import { format } from "date-fns";

export type SortDir = "asc" | "desc";
export const ANY = "all";

export const prettify = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "—");

export const DATE_RANGES: Record<string, number | null> = { all: null, "7d": 7, "30d": 30, "90d": 90 };
export const DATE_LABEL: Record<string, string> = {
  all: "Any time", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
};

/** Sort state with a stable toggle: same key flips direction, new key resets. */
export function useSortState<K extends string>(defaultKey: K, defaultDir: SortDir = "desc") {
  const [params] = useSearchParams();
  const [sortKey, setSortKey] = useState<K>((params.get("sort") as K) || defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>((params.get("dir") as SortDir) || defaultDir);

  const toggleSort = (key: K) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === defaultKey ? defaultDir : "asc");
    }
  };

  const SortHead = ({ label, sortKey: key, className }: { label: string; sortKey: K; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
      >
        {label}
        {sortKey === key ? (
          sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ChevronsUpDown className="w-3 h-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  return { sortKey, sortDir, setSortKey, setSortDir, toggleSort, SortHead };
}

/** Compare helper for mixed string/number sort values. */
export const compareBy = <T,>(value: (row: T) => string | number, dir: SortDir) => (a: T, b: T) => {
  const av = value(a);
  const bv = value(b);
  const cmp = typeof av === "number" && typeof bv === "number"
    ? av - bv
    : String(av).localeCompare(String(bv));
  return dir === "asc" ? cmp : -cmp;
};

export interface FilterChip { label: string; clear: () => void }

export const FilterChips = ({ chips, onClearAll }: { chips: FilterChip[]; onClearAll: () => void }) => {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <Badge key={c.label} variant="secondary" className="gap-1 font-normal">
          {c.label}
          <button type="button" onClick={c.clear} className="hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </Badge>
      ))}
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
};

/** Keeps the URL query string in sync so a filtered view is shareable. */
export function useUrlFilterSync(values: Record<string, string | undefined | null>) {
  const [, setParams] = useSearchParams();
  const serialized = JSON.stringify(values);
  useEffect(() => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(JSON.parse(serialized) as Record<string, string | null>)) {
      if (v) next.set(k, v);
    }
    setParams(next, { replace: true });
  }, [serialized, setParams]);
}

export const downloadCsv = (filenameBase: string, header: string[], rows: Array<Array<unknown>>) => {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.join(","), ...rows.map((r) => r.map(esc).join(","))];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
