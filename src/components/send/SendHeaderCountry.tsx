import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { COUNTRIES, type CountryInfo } from "@/lib/countries";
import { CountryFlag } from "@/components/ui/FlagImage";

type Props = {
  value: string;
  onChange: (id: string) => void;
  /** Restrict the list (e.g. supported payout corridors) */
  filterIds?: string[];
};

/** Sendwave-style inline destination-country picker for the send card header. */
export default function SendHeaderCountry({ value, onChange, filterIds }: Props) {
  const [open, setOpen] = useState(false);
  const options: CountryInfo[] = filterIds?.length
    ? COUNTRIES.filter((c) => filterIds.includes(c.id))
    : COUNTRIES;
  const active = options.find((c) => c.id === value) || COUNTRIES.find((c) => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 h-9 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          <CountryFlag country={active?.country} size="md" />
          <span className="max-w-[8rem] truncate">{active?.country ?? "Select"}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[260px] p-0">
        <Command>
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground" />
            <CommandInput placeholder="Search country…" className="h-10 bg-transparent" />
          </div>
          <CommandList className="max-h-72">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">No match.</CommandEmpty>
            <CommandGroup>
              {options.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.country} ${c.code}`}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <CountryFlag country={c.country} size="sm" />
                  <span className="flex-1 min-w-0 truncate">{c.country}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground">{c.code}</span>
                  {c.id === value && <Check className="w-4 h-4 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
