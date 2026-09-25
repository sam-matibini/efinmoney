import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { BANK_ETRANSFER_LINKS } from "@/components/payments/checkoutStrings";
import { cn } from "@/lib/utils";

export default function BankPicker({
  value,
  onChange,
  placeholder = "Type or select your bank",
}: {
  value: string;
  onChange: (bank: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-11 w-full justify-between bg-background px-3 font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type your bank" />
          <CommandList className="max-h-64">
            <CommandEmpty>No bank matches that name.</CommandEmpty>
            <CommandGroup>
              {BANK_ETRANSFER_LINKS.map((bank) => (
                <CommandItem
                  key={bank.name}
                  value={bank.name}
                  onSelect={() => {
                    onChange(bank.name);
                    setOpen(false);
                  }}
                >
                  {bank.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
