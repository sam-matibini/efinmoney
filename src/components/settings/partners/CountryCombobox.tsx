// Searchable, scrollable, typable ISO country picker used by the Partners admin forms.
// Stores the ISO 3166-1 alpha-2 code so routing/edge-function lookups are unchanged.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { ISO_COUNTRIES } from "@/lib/isoCountries";

export const countryLabel = (code?: string | null) => {
  if (!code) return "";
  const hit = ISO_COUNTRIES.find((c) => c.code === code.toUpperCase());
  return hit ? `${hit.name} (${hit.code})` : code.toUpperCase();
};

/** Resolve a code or a full country name to an ISO alpha-2 code. */
export const toCountryCode = (input?: string | null): string | null => {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  const byCode = ISO_COUNTRIES.find((c) => c.code === upper);
  if (byCode) return byCode.code;
  const byName = ISO_COUNTRIES.find((c) => c.name.toLowerCase() === raw.toLowerCase());
  return byName ? byName.code : upper.slice(0, 2);
};

export const isKnownCountry = (input?: string | null) => {
  const raw = String(input ?? "").trim();
  if (!raw) return true; // optional field
  const code = toCountryCode(raw);
  return ISO_COUNTRIES.some((c) => c.code === code);
};

export const CountryCombobox = ({
  value,
  onChange,
  placeholder = "Select country",
  className = "",
}: {
  value?: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const selected = value ? value.toUpperCase() : "";
  const items = useMemo(
    () => [...ISO_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`w-full justify-between font-normal ${className}`}
        >
          <span className="truncate">{selected ? countryLabel(selected) : placeholder}</span>
          <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country or code…" />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="none clear"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={`mr-2 h-4 w-4 ${selected ? "opacity-0" : "opacity-100"}`} />
                No country
              </CommandItem>
              {items.map((c) => (
                <CommandItem
                  key={c.code}
                  value={`${c.name} ${c.code}`}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                  }}
                >
                  <Check className={`mr-2 h-4 w-4 ${selected === c.code ? "opacity-100" : "opacity-0"}`} />
                  <span className="mr-2">{c.flag}</span>
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{c.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
