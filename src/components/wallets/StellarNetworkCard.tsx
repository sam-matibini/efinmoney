import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, ExternalLink, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStellarWallet } from "@/hooks/useStellarWallet";
import { toast } from "sonner";
import SendStellarModal from "@/components/wallets/SendStellarModal";

const StellarNetworkCard = () => {
  const {
    publicKey,
    isLoading,
    generating,
    balance,
    funded,
    balanceLoading,
    refetchBalance,
    explorerUrl,
  } = useStellarWallet();
  const [sendOpen, setSendOpen] = useState(false);

  const copy = () => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    toast.success("Stellar address copied");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                  Stellar Network
                  <Badge variant="secondary" className="text-[10px]">Testnet</Badge>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Your on-chain blockchain identity
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">XLM Balance</p>
              {balanceLoading || isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary inline-block mt-1" />
              ) : (
                <p className="text-2xl font-display font-bold tabular-nums">
                  {Number(balance).toLocaleString("en-US", {
                    maximumFractionDigits: 4,
                  })}
                </p>
              )}
              {publicKey && !funded && !balanceLoading && (
                <p className="text-[10px] text-yellow-500">Awaiting Friendbot…</p>
              )}
            </div>
          </div>

          {isLoading || !publicKey ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {generating
                  ? "Generating your Stellar account & funding with 10,000 test XLM…"
                  : "Loading Stellar account…"}
              </span>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <p className="text-xs text-muted-foreground mb-1.5">Public address</p>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/60 border border-border/50">
                  <code className="text-[11px] sm:text-xs break-all flex-1 font-mono">
                    {publicKey}
                  </code>
                  <Button size="icon" variant="ghost" onClick={copy} title="Copy">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  onClick={() => setSendOpen(true)}
                  disabled={!funded || Number(balance) <= 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Send XLM
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchBalance()}
                  disabled={balanceLoading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${balanceLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={explorerUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    StellarExpert
                  </a>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SendStellarModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        availableBalance={balance}
        onSent={() => refetchBalance()}
      />
    </motion.div>
  );
};

export default StellarNetworkCard;
