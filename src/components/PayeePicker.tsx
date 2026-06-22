import { useMemo, useState } from "react";
import { useBeneficiaries, isCanadaBeneficiary, type Beneficiary, type BeneficiaryCategory } from "@/hooks/useBeneficiaries";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Plus } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface Props {
  onSelect: (b: Beneficiary) => void;
  filterCategory?: BeneficiaryCategory | "all";
  filterCanada?: boolean;
  placeholder?: string;
  onAddNew?: () => void;
}

const CAT_LABEL: Record<BeneficiaryCategory, string> = {
  person: "Person",
  supplier: "Supplier",
  employee: "Employee",
  contractor: "Contractor",
  payee: "Payee",
  other: "Other",
};

/** Compact typeahead over the saved payees / beneficiaries. */
export default function PayeePicker({ onSelect, filterCategory = "all", filterCanada = false, placeholder = "Search saved payees…", onAddNew }: Props) {
  const { data: list, isLoading } = useBeneficiaries();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const items = list || [];
    const qq = q.trim().toLowerCase();
    return items
      .filter(b => filterCategory === "all" ? true : (b.category || "person") === filterCategory)
      .filter(b => !filterCanada || isCanadaBeneficiary(b))
      .filter(b => {
        if (!qq) return true;
        return [b.name, b.nickname, b.email, b.phone, ...(b.tags || [])]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(qq));
      })
      .slice(0, 12);
  }, [list, q, filterCategory, filterCanada]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full cursor-pointer">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            readOnly
            placeholder={placeholder}
            className="pl-9 cursor-pointer"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,92vw)] p-0" align="start">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, email, phone, tag"
              className="pl-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground space-y-2">
              <Users className="w-6 h-6 mx-auto opacity-60" />
              <p>No saved payees match.</p>
              {onAddNew && (
                <Button size="sm" variant="outline" onClick={() => { onAddNew(); setOpen(false); }}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add new payee
                </Button>
              )}
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
                    <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
                      {b.avatar_initials || b.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{b.nickname || b.name}</p>
                        <Badge variant="secondary" className="text-[10px] py-0">{CAT_LABEL[(b.category || "person") as BeneficiaryCategory]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.email || b.phone || b.eft_account || b.interac_email || "—"}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {onAddNew && filtered.length > 0 && (
          <div className="p-2 border-t border-border">
            <Button size="sm" variant="ghost" className="w-full" onClick={() => { onAddNew(); setOpen(false); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add new payee
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
