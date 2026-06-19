import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  COUNTRIES,
  POPULAR_COUNTRY_IDS,
  REGION_ORDER,
  filterCountries,
  findCountryById,
  type CountryInfo,
} from "@/lib/countries";

interface CountryPickerProps {
  value?: string | null;                  // country id
  onChange: (country: CountryInfo) => void;
  placeholder?: string;
  className?: string;
  showMethod?: boolean;                   // show payout method in trigger
  countries?: CountryInfo[];              // optional subset (defaults to all)
}

const CountryPicker = ({
  value,
  onChange,
  placeholder = "Select country",
  className,
  showMethod = true,
  countries = COUNTRIES,
}: CountryPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = findCountryById(value || undefined);

  const grouped = useMemo(() => {
    const base = query.trim() ? filterCountries(query).filter((c) => countries.some((x) => x.id === c.id)) : countries;
    const items = base;
    const popular = POPULAR_COUNTRY_IDS
      .map((id) => countries.find((c) => c.id === id))
      .filter((c): c is CountryInfo => !!c && items.includes(c));

    const byRegion = REGION_ORDER.map((region) => ({
      region,
      list: items.filter((c) => c.region === region),
    })).filter((g) => g.list.length > 0);

    return { popular, byRegion, total: items.length };
  }, [query, countries]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? (
            <span className="inline-flex items-center gap-2 truncate">
              <span className="text-lg leading-none">{selected.flag}</span>
              <span className="truncate">{selected.country}</span>
              {showMethod && (
                <span className="text-xs text-muted-foreground truncate">· {selected.method}</span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
      >
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search country or currency..."
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {grouped.total === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No results</p>
          ) : (
            <>
              {grouped.popular.length > 0 && !query && (
                <CountryGroup
                  title="Popular"
                  list={grouped.popular}
                  selectedId={value}
                  onPick={(c) => { onChange(c); setOpen(false); }}
                />
              )}
              {grouped.byRegion.map((g) => (
                <CountryGroup
                  key={g.region}
                  title={g.region}
                  list={g.list}
                  selectedId={value}
                  onPick={(c) => { onChange(c); setOpen(false); }}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const CountryGroup = ({
  title,
  list,
  selectedId,
  onPick,
}: {
  title: string;
  list: CountryInfo[];
  selectedId?: string | null;
  onPick: (c: CountryInfo) => void;
}) => (
  <div className="px-1 pb-1">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pt-2 pb-1">{title}</p>
    <ul>
      {list.map((c) => {
        const active = selectedId === c.id;
        return (
          <li key={`${title}-${c.id}`}>
            <button
              type="button"
              onClick={() => onPick(c)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-accent transition-colors",
                active && "bg-accent",
              )}
            >
              <span className="text-lg leading-none">{c.flag}</span>
              <span className="flex-1 truncate">{c.country}</span>
              <span className="text-xs text-muted-foreground">{c.code}</span>
              {active && <Check className="w-4 h-4 text-primary" />}
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);

export default CountryPicker;
