import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBeneficiaries, type Beneficiary } from "@/hooks/useBeneficiaries";
import { BENEFICIARY_COUNTRIES } from "@/components/modals/AddBeneficiaryModal";
import { Search, Users } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (b: Beneficiary) => void;
}

const ContactsPickerModal = ({ open, onOpenChange, onSelect }: Props) => {
  const { data: contacts, isLoading } = useBeneficiaries();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const items = contacts || [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.nickname || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose a contact</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Users className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No contacts found.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((c) => {
                const flag = BENEFICIARY_COUNTRIES.find((x) => x.code === c.country_code)?.flag || "🌍";
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 py-3 hover:bg-muted/40 px-2 rounded-lg transition-colors text-left"
                      onClick={() => { onSelect(c); onOpenChange(false); }}
                    >
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
                        {c.avatar_initials || c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{c.nickname || c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {flag} {c.phone || c.bank_account || ""}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{c.transfer_count}×</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
      </DialogContent>
    </Dialog>
  );
};

export default ContactsPickerModal;
