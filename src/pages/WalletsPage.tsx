import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import WalletCard from "@/components/ui/WalletCard";
import { useWallets } from "@/hooks/useWallets";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import CreateWalletModal from "@/components/modals/CreateWalletModal";

const WalletsPage = () => {
  const { data: wallets, isLoading } = useWallets();

  const totalBalance = wallets?.reduce((sum, w) => {
    // Convert to USD equivalent (simplified)
    const rate = w.currency_code === 'CAD' ? 0.74 : 1;
    return sum + Number(w.balance) * rate;
  }, 0) || 0;

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
              </div>
              <p className="text-4xl font-display font-bold">
                ${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex items-center gap-2 mt-2 text-primary-foreground/70">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Across {wallets?.length || 0} wallets</span>
              </div>
            </CardContent>
          </Card>

          {/* Wallets Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[180px] rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {wallets?.map((wallet, index) => (
                <motion.div
                  key={wallet.wallet_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <WalletCard
                    currency={wallet.currency_code}
                    balance={Number(wallet.balance)}
                    symbol={wallet.symbol}
                    flag={wallet.flag_emoji || '💰'}
                    isMain={index === 0}
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
    </div>
  );
};

export default WalletsPage;
