import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type NetworkChoice = { id: string; label: string };

/** Typable, scrollable mobile-money network list. */
export default function NetworkPicker({
  networks,
  value,
  onChange,
  placeholder = "Type or select a network",
}: {
  networks: NetworkChoice[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = networks.find((n) => n.id === value);
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
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type a network" />
          <CommandList className="max-h-64">
            <CommandEmpty>No network matches that name.</CommandEmpty>
            <CommandGroup>
              {networks.map((network) => (
                <CommandItem
                  key={network.id}
                  value={network.label}
                  onSelect={() => {
                    onChange(network.id);
                    setOpen(false);
                  }}
                >
                  {network.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
