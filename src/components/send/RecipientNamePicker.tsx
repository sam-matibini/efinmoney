import { useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { useBeneficiaries, type Beneficiary } from "@/hooks/useBeneficiaries";
import { payoutMethodLabel } from "@/lib/payoutPartner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

function contactLine(b: Beneficiary): string {
  const account = b.bank_account || b.eft_account || "";
  if (account) {
    const last = account.replace(/\D/g, "").slice(-4);
    const bank = b.bank_name || payoutMethodLabel(b);
    return last ? `•••${last} ${bank}` : bank;
  }
  if (b.phone || b.tel) return String(b.phone || b.tel);
  if (b.interac_email || b.email) return String(b.interac_email || b.email);
  return payoutMethodLabel(b);
}

/** One typable, scrollable recipient name. Quick add stays beside it. */
export default function RecipientNamePicker({
  name,
  onNameChange,
  onSelect,
  onClear,
  onQuickAdd,
  selected = false,
}: {
  name: string;
  onNameChange: (name: string) => void;
  onSelect: (b: Beneficiary) => void;
  onClear?: () => void;
  onQuickAdd: () => void;
  selected?: boolean;
}) {
  const { data: list = [] } = useBeneficiaries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((b) => {
      if (!q) return true;
      return [b.name, b.nickname, b.phone, b.email, b.bank_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [list, query]);

  const picked = list.find((b) => (b.nickname || b.name) === name);

  return (
    <div className="flex items-start gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-left"
          >
            <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Recipient
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("min-w-0 flex-1 truncate text-base", !name && "text-muted-foreground")}>
                {name || "Type a name"}
              </span>
              {selected && onClear ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Clear recipient"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClear();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onClear();
                    }
                  }}
                >
                  <X className="h-4 w-4" />
                </span>
              ) : null}
            </div>
            {picked && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{contactLine(picked)}</p>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Type a name"
              value={query}
              onValueChange={(next) => {
                setQuery(next);
                onNameChange(next);
              }}
            />
            <CommandList className="max-h-64">
              <CommandEmpty>No contact matches that name. Use quick add to save one.</CommandEmpty>
              <CommandGroup>
                {matches.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={b.id}
                    onSelect={() => {
                      onSelect(b);
                      setQuery("");
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{b.nickname || b.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{contactLine(b)}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="mt-1 h-11 w-11 shrink-0"
        aria-label="Quick add new recipient"
        title="Quick add new recipient"
        onClick={onQuickAdd}
      >
        <UserPlus className="h-5 w-5" />
      </Button>
    </div>
  );
}
