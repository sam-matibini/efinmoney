// Reusable search / filter / sort / export toolkit for the Partners & Routing tables.
// A panel declares its columns once, then renders <Controls />, <HeadRow /> and the
// returned `view` rows — filtering and sorting stay client-side.
//
// IMPORTANT: the returned Controls / HeadRow / SortHead components have a STABLE
// identity across renders (they are thin wrappers created once and read the latest
// state from a ref). Re-creating them each render would remount the search input and
// steal focus after every keystroke.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Check,
  X,
  Search,
  FileSpreadsheet,
  Download,
} from "lucide-react";
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
  /**
   * Extra option values always offered by this column's filter, even when no row
   * uses them yet (shown with a 0 count). Useful for full reference lists.
   */
  filterOptions?: string[];
  /** Pretty label for a filter option value (e.g. "ZM" → "Zambia (ZM)"). */
  filterLabel?: (value: string) => string;
  /** "includes" treats the value as a comma-separated list and matches any member. */
  filterMode?: "exact" | "includes";
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

export interface FilterOption {
  value: string;
  count: number;
  label?: string;
}

/** Searchable, scrollable, typable single-select filter. */
export const FilterCombobox = ({
  label,
  value,
  options,
  onChange,
  width = "w-[170px]",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (v: string) => void;
  width?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selected = value && value !== ALL ? value : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`h-9 ${width} justify-between font-normal`}
        >
          <span className="truncate">{selected || `All ${label.toLowerCase()}`}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={`all ${label}`}
                onSelect={() => {
                  onChange(ALL);
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-0" : "opacity-100"}`} />
                All {label.toLowerCase()}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${selected === o.value ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.value}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{o.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

interface ControlsState {
  search: string;
  setSearch: (v: string) => void;
  searchPlaceholder: string;
  filterCols: { key: string; label: string }[];
  filters: Record<string, string>;
  setFilter: (key: string, v: string) => void;
  options: Record<string, FilterOption[]>;
  viewCount: number;
  totalCount: number;
  chips: { label: string; clear: () => void }[];
  clearAll: () => void;
  exportName: string;
  exportHeader: string[];
  exportRows: () => unknown[][];
}

const ControlsView = ({ state, extra }: { state: ControlsState; extra?: ReactNode }) => (
  <div className="mb-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={state.search}
          onChange={(e) => state.setSearch(e.target.value)}
          placeholder={state.searchPlaceholder}
          className="h-9 w-52 pl-8"
        />
      </div>
      {state.filterCols.map((c) => (
        <FilterCombobox
          key={c.key}
          label={c.label}
          value={state.filters[c.key] || ALL}
          options={state.options[c.key] ?? []}
          onChange={(v) => state.setFilter(c.key, v)}
        />
      ))}
      <span className="text-xs text-muted-foreground">
        {state.viewCount} of {state.totalCount}
      </span>
      <div className="ml-auto flex items-center gap-2">
        {extra}
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(state.exportName, state.exportHeader, state.exportRows())}
        >
          <Download className="mr-1 h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadXlsx(state.exportName, [
              { name: state.exportName.slice(0, 31), header: state.exportHeader, rows: state.exportRows() },
            ])
          }
        >
          <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
        </Button>
      </div>
    </div>
    {state.chips.length > 0 && (
      <div className="flex flex-wrap items-center gap-2">
        {state.chips.map((c) => (
          <Badge key={c.label} variant="secondary" className="gap-1 font-normal">
            {c.label}
            <button type="button" onClick={c.clear} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={state.clearAll}>
          Clear all
        </Button>
      </div>
    )}
  </div>
);

interface SortState {
  sortKey: string | null;
  sortDir: SortDir;
  toggleSort: (key: string) => void;
}

const SortHeadView = <T,>({ col, sort }: { col: Col<T>; sort: SortState }) => {
  if (col.sortable === false) return <TableHead className={col.className} />;
  const active = sort.sortKey === col.key;
  return (
    <TableHead className={`${col.className ?? ""} ${col.align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => sort.toggleSort(col.key)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {col.label}
        {active ? (
          sort.sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
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
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(defaultSort ?? null);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 150);
    return () => clearTimeout(t);
  }, [search]);

  const all = useMemo(() => rows ?? [], [rows]);
  const filterCols = useMemo(() => cols.filter((c) => c.filter), [cols]);

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
    const map: Record<string, FilterOption[]> = {};
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
  }, [all, filterCols]);

  const view = useMemo(() => {
    const q = debounced.trim().toLowerCase();
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
  }, [all, cols, debounced, filters, sortKey, sortDir]);

  const exportCols = useMemo(() => cols.filter((c) => c.sortable !== false), [cols]);
  const exportHeader = useMemo(() => exportCols.map((c) => c.label), [exportCols]);
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

  // Latest state lives in a ref so the wrapper components below keep a stable identity.
  const stateRef = useRef<{ controls: ControlsState; sort: SortState }>(null as never);
  stateRef.current = {
    controls: {
      search,
      setSearch,
      searchPlaceholder,
      filterCols: filterCols.map((c) => ({ key: c.key, label: c.label })),
      filters,
      setFilter: (key, v) => setFilters((f) => ({ ...f, [key]: v })),
      options,
      viewCount: view.length,
      totalCount: all.length,
      chips,
      clearAll,
      exportName,
      exportHeader,
      exportRows,
    },
    sort: { sortKey, sortDir, toggleSort },
  };
  const colsRef = useRef(cols);
  colsRef.current = cols;

  const stable = useRef({
    Controls: ({ extra }: { extra?: ReactNode }) => (
      <ControlsView state={stateRef.current.controls} extra={extra} />
    ),
    SortHead: ({ col }: { col: Col<T> }) => <SortHeadView col={col} sort={stateRef.current.sort} />,
    HeadRow: () => (
      <TableHeader>
        <TableRow>
          {colsRef.current.map((c) => (
            <SortHeadView key={c.key} col={c} sort={stateRef.current.sort} />
          ))}
        </TableRow>
      </TableHeader>
    ),
  }).current;

  return {
    view,
    Controls: stable.Controls,
    HeadRow: stable.HeadRow,
    SortHead: stable.SortHead,
    exportHeader,
    exportRows,
    sortKey,
    sortDir,
    toggleSort,
  };
}
