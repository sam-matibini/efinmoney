// Reusable search / filter / sort / export toolkit for the Partners & Routing tables.
// A panel declares its columns once, then renders <Controls />, <HeadRow /> and the
// returned `view` rows — filtering and sorting stay client-side.
import { useMemo, useState, type ReactNode } from "react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, ChevronsUpDown, X, Search, FileSpreadsheet, Download } from "lucide-react";
import { downloadCsv, downloadXlsx } from "@/lib/tableExport";

export type SortDir = "asc" | "desc";

export interface Col<T> {
  /** Stable key used for sort/filter state. */
  key: string;
  label: string;
  /** Sortable / filterable / exportable value for a row. */
  value: (row: T) => string | number | null | undefined;
  /** Formatted export value; defaults to `value`. */
  exportValue?: (row: T) => string | number | null | undefined;
  type?: "text" | "number" | "date";
  /** Show a dropdown filter for this column's distinct values. */
  filter?: boolean;
  align?: "left" | "right";
  className?: string;
  /** Header only, no sorting (e.g. the row-actions column). */
  sortable?: boolean;
}

const ALL = "__all__";

const norm = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

const cmp = <T,>(col: Col<T>, dir: SortDir) => (a: T, b: T) => {
  const av = col.value(a);
  const bv = col.value(b);
  let out: number;
  if (col.type === "number") out = Number(av ?? 0) - Number(bv ?? 0);
  else if (col.type === "date") out = new Date(norm(av) || 0).getTime() - new Date(norm(bv) || 0).getTime();
  else out = norm(av).localeCompare(norm(bv), undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? out : -out;
};

export interface TableQueryOptions {
  /** Column key sorted by default (falls back to the source order when absent). */
  defaultSort?: string;
  defaultDir?: SortDir;
  /** File name stem for CSV / Excel exports. */
  exportName?: string;
  searchPlaceholder?: string;
}

export function useTableQuery<T>(rows: T[] | undefined, cols: Col<T>[], opts: TableQueryOptions = {}) {
  const { defaultSort, defaultDir = "desc", exportName = "export", searchPlaceholder = "Search…" } = opts;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(defaultSort ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const all = useMemo(() => rows ?? [], [rows]);
  const filterCols = cols.filter((c) => c.filter);

  /** asc → desc → back to the panel default. */
  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
      return;
    }
    setSortKey(defaultSort ?? null);
    setSortDir(defaultDir);
  };

  const options = useMemo(() => {
    const map: Record<string, { value: string; count: number }[]> = {};
    for (const c of filterCols) {
      const counts = new Map<string, number>();
      for (const r of all) {
        const v = norm(c.value(r));
        if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      map[c.key] = [...counts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([value, count]) => ({ value, count }));
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, cols]);

  const view = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = all.filter((r) => {
      for (const [key, val] of Object.entries(filters)) {
        if (!val || val === ALL) continue;
        const col = cols.find((c) => c.key === key);
        if (col && norm(col.value(r)) !== val) return false;
      }
      if (!q) return true;
      return cols.some((c) => norm(c.value(r)).toLowerCase().includes(q));
    });
    if (sortKey) {
      const col = cols.find((c) => c.key === sortKey);
      if (col) out = [...out].sort(cmp(col, sortDir));
    }
    return out;
  }, [all, cols, search, filters, sortKey, sortDir]);

  const exportCols = cols.filter((c) => c.sortable !== false);
  const exportHeader = exportCols.map((c) => c.label);
  const exportRows = () => view.map((r) => exportCols.map((c) => norm((c.exportValue ?? c.value)(r))));

  const chips = [
    ...(search.trim() ? [{ label: `Search: ${search.trim()}`, clear: () => setSearch("") }] : []),
    ...Object.entries(filters)
      .filter(([, v]) => v && v !== ALL)
      .map(([k, v]) => ({
        label: `${cols.find((c) => c.key === k)?.label ?? k}: ${v}`,
        clear: () => setFilters((f) => ({ ...f, [k]: ALL })),
      })),
  ];

  const clearAll = () => {
    setSearch("");
    setFilters({});
  };

  const SortHead = ({ col }: { col: Col<T> }) => {
    if (col.sortable === false) return <TableHead className={col.className} />;
    const active = sortKey === col.key;
    return (
      <TableHead className={`${col.className ?? ""} ${col.align === "right" ? "text-right" : ""}`}>
        <button
          type="button"
          onClick={() => toggleSort(col.key)}
          className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
            active ? "text-foreground" : ""
          }`}
        >
          {col.label}
          {active ? (
            sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      </TableHead>
    );
  };

  const HeadRow = () => (
    <TableHeader>
      <TableRow>
        {cols.map((c) => (
          <SortHead key={c.key} col={c} />
        ))}
      </TableRow>
    </TableHeader>
  );

  const Controls = ({ extra }: { extra?: ReactNode }) => (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-52 pl-8"
          />
        </div>
        {filterCols.map((c) => (
          <Select
            key={c.key}
            value={filters[c.key] || ALL}
            onValueChange={(v) => setFilters((f) => ({ ...f, [c.key]: v }))}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder={c.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All {c.label.toLowerCase()}</SelectItem>
              {(options[c.key] ?? []).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.value} ({o.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <span className="text-xs text-muted-foreground">
          {view.length} of {all.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {extra}
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(exportName, exportHeader, exportRows())}
          >
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadXlsx(exportName, [{ name: exportName.slice(0, 31), header: exportHeader, rows: exportRows() }])
            }
          >
            <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
          </Button>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Badge key={c.label} variant="secondary" className="gap-1 font-normal">
              {c.label}
              <button type="button" onClick={c.clear} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      )}
    </div>
  );

  return { view, Controls, HeadRow, SortHead, exportHeader, exportRows, sortKey, sortDir, toggleSort };
}
