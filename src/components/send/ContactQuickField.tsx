import { useMemo, useState } from "react";
import { useBeneficiaries, isCanadaBeneficiary, type Beneficiary, type BeneficiaryCategory } from "@/hooks/useBeneficiaries";
import AddBeneficiaryModal from "@/components/modals/AddBeneficiaryModal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label?: string;
  value?: Beneficiary | null;
  /** Fallback display name when the picked contact isn't a full record. */
  valueLabel?: string | null;
  onSelect: (b: Beneficiary) => void;
  onClear?: () => void;
  filterCanada?: boolean;
  filterCategory?: BeneficiaryCategory | "all";
  placeholder?: string;
  className?: string;
}

/** "To — Select contact" field with an inline "Add contact" shortcut. */
const ContactQuickField = ({
  label = "To",
  value,
  valueLabel,
  onSelect,
  onClear,
  filterCanada = false,
  filterCategory = "all",
  placeholder = "Select contact",
  className,
}: Props) => {
  const { data: list, isLoading } = useBeneficiaries();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (list || [])
      .filter((b) => (filterCategory === "all" ? true : (b.category || "person") === filterCategory))
      .filter((b) => !filterCanada || isCanadaBeneficiary(b))
      .filter((b) => {
        if (!qq) return true;
        return [b.name, b.nickname, b.email, b.phone, ...(b.tags || [])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(qq));
      })
      .slice(0, 20);
  }, [list, q, filterCanada, filterCategory]);

  const selectedName = value?.nickname || value?.name || valueLabel || "";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-end justify-between gap-3">
        <Label>{label}</Label>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
        >
          Add contact <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-11 w-full" />
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full h-11 flex items-center gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm hover:bg-muted/40 transition-colors"
            >
              <span className={cn("flex-1 truncate", !selectedName && "text-muted-foreground")}>
                {selectedName || placeholder}
              </span>
              {selectedName && onClear ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Clear contact"
                  onClick={(e) => { e.stopPropagation(); onClear(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClear(); } }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </span>
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(420px,92vw)] p-0" align="start">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name, email, phone"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
                  <p>No saved contacts match.</p>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setAddOpen(true); }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Add contact
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {filtered.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => { onSelect(b); setOpen(false); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-center gap-3"
                      >
                        <span className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                          {b.avatar_initials || b.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium truncate">{b.nickname || b.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">
                            {b.email || b.phone || b.eft_account || b.interac_email || "—"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <AddBeneficiaryModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSaved={(b) => { onSelect(b); setAddOpen(false); }}
      />
    </div>
  );
};

export default ContactQuickField;
