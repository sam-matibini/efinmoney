import { motion } from "framer-motion";
import { useState } from "react";
import { ArrowUpRight, Plus, MoreHorizontal, Star, Snowflake, Play, Pencil, Trash2 } from "lucide-react";
import SendMoneyModal from "@/components/modals/SendMoneyModal";
import CardPaymentModal from "@/components/modals/CardPaymentModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

interface WalletCardProps {
  walletId?: string;
  currency: string;
  balance: number;
  symbol: string;
  flag: string;
  change?: number;
  isMain?: boolean;
  isDefault?: boolean;
  status?: 'active' | 'frozen' | 'suspended' | 'closed';
  onSetDefault?: (walletId: string) => void;
  onToggleFreeze?: (walletId: string, freeze: boolean) => void;
  onEdit?: (wallet: { walletId: string; currency: string; balance: number; symbol: string; flag: string }) => void;
  onDelete?: (wallet: { walletId: string; currency: string; balance: number; symbol: string; flag: string }) => void;
}

const WalletCard = ({ 
  walletId,
  currency, 
  balance, 
  symbol, 
  flag, 
  change = 0, 
  isMain = false,
  isDefault = false,
  status = 'active',
  onSetDefault,
  onToggleFreeze,
  onEdit,
  onDelete,
}: WalletCardProps) => {
  const [topUpOpen, setTopUpOpen] = useState(false);
  const formatBalance = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const isFrozen = status === 'frozen';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ duration: 0.3 }}
      className={`group relative overflow-hidden rounded-2xl p-4 sm:p-6 ${
        isMain 
          ? 'gradient-primary shadow-glow min-h-[160px] sm:min-h-[180px]' 
          : 'glass shadow-card'
      } ${isFrozen ? 'opacity-75' : ''}`}
    >
      {/* Big country flag top-right */}
      <span className="pointer-events-none select-none absolute top-3 right-3 text-[40px] leading-none drop-shadow-md z-10">
        {flag}
      </span>

      {/* Shine sweep on hover */}
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent animate-shine" />

      {/* Floating bubbles */}
      <span className="pointer-events-none absolute top-8 left-12 w-2 h-2 rounded-full bg-white/30 animate-bubble-drift" />
      <span className="pointer-events-none absolute top-20 left-28 w-1.5 h-1.5 rounded-full bg-white/25 animate-bubble-drift" style={{ animationDelay: '2s' }} />
      <span className="pointer-events-none absolute bottom-10 left-20 w-2.5 h-2.5 rounded-full bg-white/20 animate-bubble-drift" style={{ animationDelay: '4s' }} />

      {isMain && (
        <div className="absolute inset-0 opacity-20">
          <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-foreground/10 blur-3xl" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-foreground/10 blur-2xl" />
        </div>
      )}

      {/* Frozen overlay */}
      {isFrozen && (
        <div className="absolute inset-0 bg-muted/30 backdrop-blur-[1px] z-10 flex items-center justify-center">
          <div className="flex items-center gap-2 bg-background/80 px-3 py-1.5 rounded-full">
            <Snowflake className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-muted-foreground">Frozen</span>
          </div>
        </div>
      )}
      
      <div className="relative z-20">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-3xl sm:text-[32px] leading-none drop-shadow-sm">{flag}</span>
            <span className={`font-display font-semibold text-sm sm:text-base ${isMain ? 'text-primary-foreground' : 'text-foreground'}`}>
              {currency}
            </span>
            {isDefault && (
              <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                isMain ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary'
              }`}>
                <Star className="w-3 h-3 fill-current" />
                Default
              </span>
            )}
          </div>
          {walletId && (onSetDefault || onToggleFreeze || onEdit || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`p-1.5 sm:p-2 rounded-full transition-colors ${
                  isMain 
                    ? 'hover:bg-foreground/10' 
                    : 'hover:bg-muted'
                }`}>
                  <MoreHorizontal className={`w-4 h-4 sm:w-5 sm:h-5 ${isMain ? 'text-primary-foreground/70' : 'text-muted-foreground'}`} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onSetDefault && !isDefault && (
                  <DropdownMenuItem onClick={() => onSetDefault(walletId)}>
                    <Star className="w-4 h-4 mr-2" />
                    Set as Default
                  </DropdownMenuItem>
                )}
                {onToggleFreeze && (
                  <DropdownMenuItem onClick={() => onToggleFreeze(walletId, !isFrozen)}>
                    {isFrozen ? (
                      <>
                        <Play className="w-4 h-4 mr-2" />
                        Unfreeze Wallet
                      </>
                    ) : (
                      <>
                        <Snowflake className="w-4 h-4 mr-2" />
                        Freeze Wallet
                      </>
                    )}
                  </DropdownMenuItem>
                )}
                {(onEdit || onDelete) && (onSetDefault || onToggleFreeze) && (
                  <DropdownMenuSeparator />
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={() => onEdit({ walletId, currency, balance, symbol, flag })}>
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit Wallet
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem 
                    onClick={() => onDelete({ walletId, currency, balance, symbol, flag })}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Wallet
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="mb-3 sm:mb-4">
          <p className={`text-xs sm:text-sm mb-1 ${isMain ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
            Available Balance
          </p>
          <h2 className={`text-2xl sm:text-3xl font-display font-bold tracking-tight ${
            isMain ? 'text-primary-foreground' : 'text-foreground'
          }`}>
            <AnimatedNumber value={balance} prefix={symbol} decimals={2} duration={1100} />
          </h2>
          {change !== 0 && (
            <p className={`text-xs sm:text-sm mt-1 ${
              change > 0 
                ? 'text-primary' 
                : 'text-destructive'
            }`}>
              {change > 0 ? '+' : ''}{change.toFixed(2)}% today
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <SendMoneyModal>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={isFrozen}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
                isMain 
                  ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30' 
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Send
            </motion.button>
          </SendMoneyModal>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={isFrozen || !walletId}
            onClick={() => walletId && setTopUpOpen(true)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
              isMain 
                ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30' 
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Top-up
          </motion.button>
        </div>
      </div>

      {walletId && (
        <TopUpModal
          open={topUpOpen}
          onOpenChange={setTopUpOpen}
          defaultWalletId={walletId}
          title={`Top up ${currency} wallet`}
        />
      )}
    </motion.div>
  );
};

export default WalletCard;
