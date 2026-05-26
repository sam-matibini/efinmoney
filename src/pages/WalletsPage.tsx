import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import WalletCard from "@/components/ui/WalletCard";
import { useWallets } from "@/hooks/useWallets";
import { useWalletManagement } from "@/hooks/useWalletManagement";
import { useFxRates } from "@/hooks/useFxRates";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CreateWalletModal from "@/components/modals/CreateWalletModal";
import EditWalletModal from "@/components/modals/EditWalletModal";
import DeleteWalletModal from "@/components/modals/DeleteWalletModal";
import { flagForCurrency } from "@/lib/flags";
import StellarNetworkCard from "@/components/wallets/StellarNetworkCard";

type WalletModalData = {
  walletId: string;
  currency: string;
  balance: number;
  symbol: string;
  flag: string;
} | null;

const WalletsPage = () => {
  const { data: wallets, isLoading } = useWallets();
  const { data: fxRates } = useFxRates();
  const [editWallet, setEditWallet] = useState<WalletModalData>(null);
  const [deleteWallet, setDeleteWallet] = useState<WalletModalData>(null);
  const { setDefault, toggleFreeze, updateWallet, deleteWallet: deleteWalletFn } = useWalletManagement();

  const usdRateMap = useMemo(() => {
    const map = new Map<string, number>();
    map.set("USD", 1);
    for (const r of fxRates ?? []) {
      if (r.to_currency === "USD" && !map.has(r.from_currency)) {
        map.set(r.from_currency, Number(r.effective_rate));
      }
    }
    for (const r of fxRates ?? []) {
      if (r.from_currency === "USD" && !map.has(r.to_currency)) {
        const v = Number(r.effective_rate);
        if (v > 0) map.set(r.to_currency, 1 / v);
      }
    }
    return map;
  }, [fxRates]);

  const { totalUsd, excludedCount } = useMemo(() => {
    let total = 0;
    let excluded = 0;
    for (const w of wallets ?? []) {
      const rate = usdRateMap.get(w.currency_code);
      if (rate == null) {
        excluded += 1;
        continue;
      }
      total += Number(w.balance) * rate;
    }
    return { totalUsd: total, excludedCount: excluded };
  }, [wallets, usdRateMap]);

  const sortedWallets = wallets?.slice().sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return Number(b.balance) - Number(a.balance);
  });

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      
      <main className="container px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-display font-bold text-foreground">My Wallets</h1>
              <p className="text-muted-foreground">Manage your multi-currency wallets</p>
            </div>
            <CreateWalletModal>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Wallet
              </Button>
            </CreateWalletModal>
          </div>

          {/* Total Balance Card */}
          <Card className="gradient-primary text-primary-foreground">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <Wallet className="w-6 h-6" />
                <span className="text-primary-foreground/70">Total Balance (USD Equivalent)</span>
                {excludedCount > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <AlertTriangle className="w-4 h-4 text-yellow-300" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {excludedCount} wallet{excludedCount === 1 ? "" : "s"} excluded — exchange rate unavailable
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <p className="text-4xl font-display font-bold">
                ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
              </p>
              <div className="flex items-center gap-2 mt-2 text-primary-foreground/70">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Across {wallets?.length || 0} wallets</span>
              </div>
            </CardContent>
          </Card>

          {/* Stellar Network (Testnet) */}
          <StellarNetworkCard />

          {/* Wallets Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[180px] rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedWallets?.map((wallet, index) => (
                <motion.div
                  key={wallet.wallet_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <WalletCard
                    walletId={wallet.wallet_id}
                    currency={wallet.currency_code}
                    balance={Number(wallet.balance)}
                    symbol={wallet.symbol}
                    flag={flagForCurrency(wallet.currency_code) !== '🌍' ? flagForCurrency(wallet.currency_code) : (wallet.flag_emoji || '💰')}
                    isMain={index === 0}
                    isDefault={wallet.is_default}
                    status={wallet.status}
                    onSetDefault={setDefault}
                    onToggleFreeze={(id, freeze) => toggleFreeze({ walletId: id, freeze })}
                    onEdit={(w) => setEditWallet(w)}
                    onDelete={(w) => setDeleteWallet(w)}
                    showStellarBadge={wallet.currency_code === 'USD'}
                  />
                </motion.div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!isLoading && (!wallets || wallets.length === 0) && (
            <Card>
              <CardContent className="py-12 text-center">
                <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No Wallets Yet</h3>
                <p className="text-muted-foreground mb-4">Create your first wallet to start managing your money</p>
                <CreateWalletModal>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Wallet
                  </Button>
                </CreateWalletModal>
              </CardContent>
            </Card>
          )}
        </motion.div>
      </main>

      <MobileNav />

      {/* Edit Wallet Modal */}
      <EditWalletModal
        isOpen={!!editWallet}
        onClose={() => setEditWallet(null)}
        wallet={editWallet}
        onSave={updateWallet}
      />

      {/* Delete Wallet Modal */}
      <DeleteWalletModal
        isOpen={!!deleteWallet}
        onClose={() => setDeleteWallet(null)}
        wallet={deleteWallet}
        onDelete={(walletId) => deleteWalletFn(walletId, deleteWallet?.balance || 0)}
      />
    </div>
  );
};

export default WalletsPage;
