import { CalendarRange, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DATE_PRESETS,
  STATUS_FILTERS,
  presetLabel,
  type DatePreset,
  type StatementSort,
  type StatementSortKey,
} from "@/lib/statementFilters";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  preset: DatePreset;
  onPresetChange: (preset: DatePreset) => void;
  status: string;
  onStatusChange: (value: string) => void;
  purpose: string;
  onPurposeChange: (value: string) => void;
  sort: StatementSort;
  onSortChange: (sort: StatementSort) => void;
  resultCount?: number;
  totalCount?: number;
}

const SORT_FIELDS: { id: StatementSortKey; label: string }[] = [
  { id: "date", label: "Date" },
  { id: "description", label: "Description" },
  { id: "reference", label: "Reference" },
  { id: "payee", label: "Sender / payee" },
  { id: "purpose", label: "Purpose" },
  { id: "status", label: "Status" },
  { id: "moneyOut", label: "Money out" },
  { id: "moneyIn", label: "Money in" },
];

export const StatementFilters = ({
  search,
  onSearchChange,
  from,
  onFromChange,
  to,
  onToChange,
  preset,
  onPresetChange,
  status,
  onStatusChange,
  purpose,
  onPurposeChange,
  sort,
  onSortChange,
  resultCount,
  totalCount,
}: Props) => {
  const filterCount = (status !== "all" ? 1 : 0) + (purpose.trim() ? 1 : 0);
  const hasFilters = !!(search.trim() || from || to || filterCount);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search description, payee, reference, purpose"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 pr-9"
            aria-label="Search transactions"
          />
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
              onClick={() => onSearchChange("")}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-10 justify-start gap-2 font-normal">
              <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{presetLabel(preset, from, to)}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[22rem] space-y-3 p-3">
            <p className="text-sm font-semibold">Date range</p>
            <div className="grid grid-cols-2 gap-1">
              {DATE_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPresetChange(item.id)}
                  className={`rounded-md px-2 py-1.5 text-left text-sm ${
                    preset === item.id ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => onFromChange(e.target.value)}
                  aria-label="From date"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => onToChange(e.target.value)}
                  aria-label="To date"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-10 gap-2">
              <Filter className="h-4 w-4" />
              Filter
              {filterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {filterCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <p className="text-sm font-semibold">Filter</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={onStatusChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Purpose contains</Label>
              <Input
                value={purpose}
                onChange={(e) => onPurposeChange(e.target.value)}
                placeholder="Mobile money, transfer, bill…"
              />
            </div>
            {filterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  onStatusChange("all");
                  onPurposeChange("");
                }}
              >
                Clear filters
              </Button>
            )}
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" className="h-10 gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Sort
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-3">
            <p className="text-sm font-semibold">Sort by</p>
            <Select
              value={sort.key}
              onValueChange={(key) => onSortChange({ ...sort, key: key as StatementSortKey })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_FIELDS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={sort.dir === "desc" ? "default" : "outline"}
                size="sm"
                onClick={() => onSortChange({ ...sort, dir: "desc" })}
              >
                Descending
              </Button>
              <Button
                type="button"
                variant={sort.dir === "asc" ? "default" : "outline"}
                size="sm"
                onClick={() => onSortChange({ ...sort, dir: "asc" })}
              >
                Ascending
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {hasFilters && resultCount != null && totalCount != null && (
        <p className="text-xs text-muted-foreground">
          Showing {resultCount} of {totalCount} transaction{totalCount === 1 ? "" : "s"}
          {search.trim() ? ` matching “${search.trim()}”` : ""}
        </p>
      )}
    </div>
  );
};
