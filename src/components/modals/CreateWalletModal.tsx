import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useWallets } from "@/hooks/useWallets";
import { useCreateWallet } from "@/hooks/useCreateWallet";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Search, Wallet } from "lucide-react";
import { toast } from "sonner";

const POPULAR_CODES = ["NGN", "USD", "CAD", "KES", "GBP", "EUR", "GHS", "UGX", "TZS", "ZMW"];

interface CreateWalletModalProps {
  children: React.ReactNode;
}

const CreateWalletModal = ({ children }: CreateWalletModalProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const { data: currencies, isLoading: currenciesLoading } = useCurrencies();
  const { data: wallets } = useWallets();
  const createWallet = useCreateWallet();

  const existingCurrencies = useMemo(
    () => new Set(wallets?.map((w) => w.currency_code) || []),
    [wallets],
  );
  const availableCurrencies = useMemo(
    () => (currencies || []).filter((c) => !existingCurrencies.has(c.code)),
    [currencies, existingCurrencies],
  );

  const { popular, others } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? availableCurrencies.filter(
          (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
        )
      : availableCurrencies;
    const popularSet = new Set(POPULAR_CODES);
    const popular = POPULAR_CODES
      .map((code) => filtered.find((c) => c.code === code))
      .filter(Boolean) as typeof filtered;
    const others = filtered
      .filter((c) => !popularSet.has(c.code))
      .sort((a, b) => a.code.localeCompare(b.code));
    return { popular, others };
  }, [availableCurrencies, search]);

  const handleCreate = async () => {
    if (!selectedCurrency) return;
    try {
      await createWallet.mutateAsync(selectedCurrency);
      toast.success(`${selectedCurrency} wallet created successfully!`);
      setIsOpen(false);
      setSelectedCurrency(null);
      setSearch("");
    } catch {
      toast.error("Failed to create wallet. Please try again.");
    }
  };

  const renderCurrency = (currency: (typeof availableCurrencies)[number]) => (
    <motion.button
      key={currency.code}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={() => setSelectedCurrency(currency.code)}
      className={`w-full flex items-center justify-between p-4 rounded-xl transition-all ${
        selectedCurrency === currency.code
          ? "bg-primary/20 border-2 border-primary"
          : "bg-secondary hover:bg-secondary/80 border-2 border-transparent"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{currency.flag_emoji || "💰"}</span>
        <div className="text-left">
          <p className="font-medium text-foreground">{currency.code}</p>
          <p className="text-sm text-muted-foreground">{currency.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground capitalize">{currency.currency_type}</span>
        {selectedCurrency === currency.code && (
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
            <Check className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
      </div>
    </motion.button>
  );

  const noResults = popular.length === 0 && others.length === 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setSelectedCurrency(null);
          setSearch("");
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            Create New Wallet
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {currenciesLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : availableCurrencies.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                You already have wallets for all available currencies.
              </p>
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search currency (e.g. NGN, Naira)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {popular.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-1">
                      Popular currencies
                    </p>
                    <div className="space-y-2">{popular.map(renderCurrency)}</div>
                  </div>
                )}

                {others.length > 0 && (
                  <div className="space-y-2">
                    {popular.length > 0 && (
                      <div className="flex items-center gap-2 pt-1">
                        <div className="h-px flex-1 bg-border" />
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          All currencies
                        </p>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className="space-y-2">{others.map(renderCurrency)}</div>
                  </div>
                )}

                {noResults && (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    No currencies match "{search}"
                  </p>
                )}
              </div>

              <Button
                className="w-full mt-4"
                size="lg"
                onClick={handleCreate}
                disabled={!selectedCurrency || createWallet.isPending}
              >
                {createWallet.isPending ? "Creating..." : "Create Wallet"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWalletModal;
