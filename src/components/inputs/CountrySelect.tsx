import { ISO_COUNTRIES } from "@/lib/isoCountries";
import SearchableSelect, { type SearchableSelectOption } from "@/components/ui/SearchableSelect";

interface CountrySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

const OPTIONS: SearchableSelectOption[] = ISO_COUNTRIES.map((c) => ({
  value: c.code,
  // Searchable text includes code, name, and flag so any of the three find it
  keywords: `${c.code} ${c.name} ${c.flag}`,
  label: `${c.flag}  ${c.name}`,
}));

const CountrySelect = ({
  value,
  onValueChange,
  disabled,
  className,
  placeholder = "Select country",
  id,
}: CountrySelectProps) => {
  return (
    <SearchableSelect
      value={value}
      onValueChange={onValueChange}
      options={OPTIONS}
      placeholder={placeholder}
      searchPlaceholder="Search country..."
      emptyText="No country found."
      disabled={disabled}
      className={className}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(id ? { id } : {})}
    />
  );
};

export default CountrySelect;
