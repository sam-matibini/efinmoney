import { useState, useEffect } from "react";
import { Search, ArrowRight, Wallet, Send } from "lucide-react";
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
}

interface ResultItem {
  type: 'transfer' | 'wallet';
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const SearchModal = ({ open, onOpenChange }: SearchModalProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!user || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const q = query.trim();
      const numeric = parseFloat(q);
      const isNumeric = !isNaN(numeric);

      const transferQuery = supabase
        .from('transfers')
        .select('id, recipient_name, source_amount, source_currency, target_currency')
        .eq('sender_id', user.id)
        .limit(5);

      let transfers: any[] = [];
      const nameRes = await transferQuery.ilike('recipient_name', `%${q}%`);
      transfers = nameRes.data || [];

      if (isNumeric && transfers.length < 5) {
        const amtRes = await supabase
          .from('transfers')
          .select('id, recipient_name, source_amount, source_currency, target_currency')
          .eq('sender_id', user.id)
          .eq('source_amount', numeric)
          .limit(5);
        transfers = [...transfers, ...(amtRes.data || [])];
      }

      const walletsRes = await supabase
        .from('wallets')
        .select('id, currency_code, currencies(name, symbol)')
        .eq('user_id', user.id)
        .ilike('currency_code', `%${q.toUpperCase()}%`)
        .limit(5);

      const transferResults: ResultItem[] = transfers.map((t: any) => ({
        type: 'transfer',
        id: t.id,
        title: t.recipient_name,
        subtitle: `${t.source_amount} ${t.source_currency} → ${t.target_currency}`,
        href: '/send',
      }));

      const walletResults: ResultItem[] = (walletsRes.data || []).map((w: any) => ({
        type: 'wallet',
        id: w.id,
        title: `${w.currency_code} Wallet`,
        subtitle: w.currencies?.name || w.currency_code,
        href: '/wallets',
      }));

      setResults([...transferResults, ...walletResults]);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, user]);

  const handleSelect = (item: ResultItem) => {
    onOpenChange(false);
    navigate(item.href);
  };

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
            placeholder="Search transfers, wallets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border-0 focus-visible:ring-0 px-0 text-base"
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          {query.length < 2 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search
            </p>
          ) : loading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Searching...</p>
          ) : results.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No results found</p>
          ) : (
            <div className="divide-y divide-border">
              {results.map((r) => (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => handleSelect(r)}
                  className="w-full text-left p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    {r.type === 'transfer' ? (
                      <Send className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SearchModal;
