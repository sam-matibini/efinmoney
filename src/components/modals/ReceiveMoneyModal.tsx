import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface ReceiveMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: {
    walletId: string;
    currency: string;
    balance: number;
    symbol: string;
    flag: string;
  } | null;
}

const ReceiveMoneyModal = ({ isOpen, onClose, wallet }: ReceiveMoneyModalProps) => {
  const [copied, setCopied] = useState(false);

  if (!wallet) return null;

  const walletIdentifier = wallet.walletId;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletIdentifier);
      setCopied(true);
      toast.success("Wallet ID copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleDownloadQR = () => {
    const canvas = document.getElementById("receive-qr-code") as HTMLCanvasElement;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `wallet-${wallet.currency}-${wallet.walletId.slice(0, 8)}.png`;
    link.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground flex items-center gap-2">
            <span className="text-2xl">{wallet.flag}</span>
            Receive {wallet.currency}
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 py-4"
        >
          {/* Wallet Info */}
          <div className="p-4 rounded-xl bg-muted/50 space-y-1">
            <p className="text-xs text-muted-foreground">Wallet</p>
            <p className="font-display font-semibold text-foreground">
              {wallet.currency} Wallet
            </p>
            <p className="text-sm text-muted-foreground">
              Current balance: {wallet.symbol}
              {wallet.balance.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-white rounded-2xl shadow-card">
              <QRCodeCanvas
                id="receive-qr-code"
                value={walletIdentifier}
                size={200}
                level="H"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Scan this QR code to send funds to this {wallet.currency} wallet
            </p>
          </div>

          {/* Wallet Identifier */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Wallet ID</label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-3 rounded-xl bg-secondary border border-border overflow-hidden">
                <p className="text-sm font-mono text-foreground truncate">
                  {walletIdentifier}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopy}
                className="px-4 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </motion.button>
            </div>
          </div>

          {/* Download QR */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownloadQR}
            className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download QR Code
          </motion.button>

          <p className="text-xs text-muted-foreground text-center">
            Only send {wallet.currency} to this wallet. Sending other currencies may result in loss of funds.
          </p>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};

export default ReceiveMoneyModal;
