import { useState, useEffect, useRef } from "react";
import { Search, ArrowRight, Wallet, Send, Users, CreditCard, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
}

type ResultType = "transfer" | "wallet" | "contact" | "card" | "ledger";

interface ResultItem {
  type: ResultType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  group: string;
}

const ICONS: Record<ResultType, typeof Send> = {
  transfer: Send,
  wallet: Wallet,
  contact: Users,
  card: CreditCard,
  ledger: BookOpen,
};

const SearchModal = ({ open, onOpenChange, initialQuery = "", onQueryChange }: SearchModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery(initialQuery);
    }
    if (!open) {
      setQuery("");
      setResults([]);
    }
    wasOpen.current = open;
  }, [open, initialQuery]);

  useEffect(() => {
    if (!user || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();
      const like = `%${q}%`;
      const numeric = parseFloat(q);
      const isNumeric = !isNaN(numeric);

      const [
        transfersByName,
        transfersByAmount,
        walletsRes,
        beneficiariesRes,
        savedCardsRes,
        issuedCardsRes,
        ledgerRes,
      ] = await Promise.all([
        supabase
          .from("transfers")
          .select("id, recipient_name, source_amount, source_currency, target_currency")
          .eq("sender_id", user.id)
          .ilike("recipient_name", like)
          .order("created_at", { ascending: false })
          .limit(5),
        isNumeric
          ? supabase
              .from("transfers")
              .select("id, recipient_name, source_amount, source_currency, target_currency")
              .eq("sender_id", user.id)
              .eq("source_amount", numeric)
              .limit(5)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("wallets")
          .select("id, currency_code, currencies(name, symbol)")
          .eq("user_id", user.id)
          .ilike("currency_code", `%${q.toUpperCase()}%`)
          .limit(5),
        supabase
          .from("beneficiaries" as any)
          .select("id, name, phone, payout_method, country_code")
          .or(`name.ilike.${like},phone.ilike.${like},nickname.ilike.${like}`)
          .limit(5),
        supabase
          .from("saved_payment_methods")
          .select("id, card_brand, last_four, cardholder_name")
          .eq("user_id", user.id)
          .or(`last_four.ilike.${like},cardholder_name.ilike.${like},card_brand.ilike.${like}`)
          .limit(5),
        supabase
          .from("issued_cards" as any)
          .select("id, nickname, last4, brand, currency")
          .eq("user_id", user.id)
          .or(`nickname.ilike.${like},last4.ilike.${like},brand.ilike.${like}`)
          .limit(5),
        supabase
          .from("ledger_entries")
          .select("id, description, debit_amount, credit_amount, currency_code, created_at, reference_type")
          .eq("created_by", user.id)
          .ilike("description", like)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const transfersMap = new Map<string, any>();
      [...(transfersByName.data || []), ...((transfersByAmount as any).data || [])].forEach(
        (t: any) => transfersMap.set(t.id, t),
      );

      const transferResults: ResultItem[] = Array.from(transfersMap.values()).map((t) => ({
        type: "transfer",
        group: "Transfers",
        id: t.id,
        title: t.recipient_name,
        subtitle: `${t.source_amount} ${t.source_currency} → ${t.target_currency}`,
        href: `/transfers/${t.id}`,
      }));

      const walletResults: ResultItem[] = (walletsRes.data || []).map((w: any) => ({
        type: "wallet",
        group: "Wallets",
        id: w.id,
        title: `${w.currency_code} Wallet`,
        subtitle: w.currencies?.name || w.currency_code,
        href: "/wallets",
      }));

      const contactResults: ResultItem[] = ((beneficiariesRes.data as any[]) || []).map((b: any) => ({
        type: "contact",
        group: "Contacts",
        id: b.id,
        title: b.name,
        subtitle: [b.phone, b.payout_method, b.country_code].filter(Boolean).join(" · ") || "Saved contact",
        href: "/contacts",
      }));

      const savedCardResults: ResultItem[] = (savedCardsRes.data || []).map((c: any) => ({
        type: "card",
        group: "Cards",
        id: `saved-${c.id}`,
        title: `${c.card_brand || "Card"} •••• ${c.last_four || ""}`.trim(),
        subtitle: c.cardholder_name || "Saved payment method",
        href: "/cards",
      }));

      const issuedCardResults: ResultItem[] = ((issuedCardsRes.data as any[]) || []).map((c: any) => ({
        type: "card",
        group: "Cards",
        id: `issued-${c.id}`,
        title: c.nickname || `${c.brand || "Card"} •••• ${c.last4 || ""}`.trim(),
        subtitle: `${c.brand || ""} ${c.currency || ""}`.trim() || "eFin card",
        href: `/cards/efin/${c.id}`,
      }));

      const ledgerResults: ResultItem[] = (ledgerRes.data || []).map((l: any) => {
        const amt = Number(l.credit_amount) || Number(l.debit_amount) || 0;
        const sign = Number(l.credit_amount) > 0 ? "+" : "-";
        return {
          type: "ledger" as const,
          group: "Ledger",
          id: l.id,
          title: l.description || "Ledger entry",
          subtitle: `${sign}${amt} ${l.currency_code || ""} · ${l.reference_type || ""}`,
          href: `/transactions/${l.id}`,
        };
      });

      setResults([
        ...transferResults,
        ...contactResults,
        ...walletResults,
        ...savedCardResults,
        ...issuedCardResults,
        ...ledgerResults,
      ]);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, user]);

  const handleSelect = (item: ResultItem) => {
    onOpenChange(false);
    navigate(item.href);
  };

  // Group results by their group label, preserving insertion order
  const grouped = results.reduce<Record<string, ResultItem[]>>((acc, r) => {
    (acc[r.group] ||= []).push(r);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search transfers, contacts, wallets, cards, ledger..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onQueryChange?.(e.target.value);
            }}
            className="border-0 focus-visible:ring-0 px-0 text-base"
          />
        </div>
        <div className="max-h-[28rem] overflow-y-auto">
          {query.length < 2 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </p>
          ) : loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No results found</p>
          ) : (
            <div>
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </p>
                  <div className="divide-y divide-border">
                    {items.map((r) => {
                      const Icon = ICONS[r.type];
                      return (
                        <button
                          key={`${r.type}-${r.id}`}
                          onClick={() => handleSelect(r)}
                          className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                        >
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchModal;
