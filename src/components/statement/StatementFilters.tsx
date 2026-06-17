import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  from: string;
  onFromChange: (value: string) => void;
  to: string;
  onToChange: (value: string) => void;
  resultCount?: number;
  totalCount?: number;
}

export const StatementFilters = ({
  search,
  onSearchChange,
  from,
  onFromChange,
  to,
  onToChange,
  resultCount,
  totalCount,
}: Props) => {
  const hasFilters = !!(search.trim() || from || to);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="pointer-events-none w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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
        <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} aria-label="From date" />
        <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} aria-label="To date" />
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
