import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Download, AtSign, Hash, Mail } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { CurrencyFlag } from "@/components/ui/FlagImage";

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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const { data: profile } = useProfile();

  if (!wallet) return null;

  const accountNumber = profile?.account_number ?? "";
  const efinTag = profile?.efin_tag ?? "";
  const email = profile?.email ?? "";

  // Primary identifier preference: account number → @tag → email
  const primary = accountNumber || efinTag || email || wallet.walletId;
  const qrPayload = `efin://pay?to=${encodeURIComponent(primary)}&currency=${wallet.currency}`;

  const copy = async (label: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedKey(null), 1800);
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
    link.download = `efinmoney-${wallet.currency}-${(accountNumber || wallet.walletId).slice(0, 10)}.png`;
    link.click();
  };

  const rows: Array<{ key: string; icon: any; label: string; value: string }> = [];
  if (accountNumber) rows.push({ key: "Account number", icon: Hash, label: "Account number", value: accountNumber });
  if (efinTag) rows.push({ key: "eFin tag", icon: AtSign, label: "eFin tag", value: `@${efinTag.replace(/^@/, "")}` });
  if (email) rows.push({ key: "Email", icon: Mail, label: "Email", value: email });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground flex items-center gap-2">
            <CurrencyFlag code={wallet.currency} size="md" />
            Receive {wallet.currency}
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5 py-2"
        >
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

          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-white rounded-2xl shadow-card">
              <QRCodeCanvas
                id="receive-qr-code"
                value={qrPayload}
                size={200}
                level="H"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center max-w-xs">
              Other eFinMoney users can scan this code to send you {wallet.currency} instantly.
            </p>
          </div>

          <div className="space-y-2">
            {rows.length === 0 && (
              <div className="text-xs text-muted-foreground text-center p-3 rounded-lg bg-muted/40">
                Complete your KYC to get an account number and @eFin tag for receiving funds.
              </div>
            )}
            {rows.map(({ key, icon: Icon, label, value }) => (
              <div key={key} className="space-y-1">
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Icon className="w-3 h-3" /> {label}
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 px-3 py-2.5 rounded-xl bg-secondary border border-border overflow-hidden">
                    <p className="text-sm font-mono text-foreground truncate">{value}</p>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => copy(label, value)}
                    className="px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
                    aria-label={`Copy ${label}`}
                  >
                    {copiedKey === label ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </motion.button>
                </div>
              </div>
            ))}
          </div>

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
