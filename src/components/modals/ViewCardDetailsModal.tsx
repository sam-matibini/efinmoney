import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { RevealedCardSecrets } from "@/hooks/useCards";

interface ViewCardDetailsModalProps {
  open: boolean;
  onClose: () => void;
  secrets: RevealedCardSecrets | null;
}

const formatPan = (pan: string) => pan.replace(/(.{4})/g, "$1 ").trim();

const ViewCardDetailsModal = ({ open, onClose, secrets }: ViewCardDetailsModalProps) => {
  const [reveal, setReveal] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    setReveal(true);
    setCopied(false);
    onClose();
  };

  if (!secrets) return null;

  const expiry =
    secrets.expiry_month && secrets.expiry_year
      ? `${String(secrets.expiry_month).padStart(2, "0")}/${String(secrets.expiry_year).slice(-2)}`
      : "--/--";

  const copyAll = async () => {
    const lines = [
      `Cardholder: ${secrets.cardholder_name}`,
      `Card number: ${formatPan(secrets.pan)}`,
      `Expiry: ${expiry}`,
      `CVV: ${secrets.cvv}`,
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Card details copied");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Card details
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl p-5 bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs uppercase opacity-80 capitalize">{secrets.card_network}</span>
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="p-1.5 hover:bg-primary-foreground/10 rounded-md"
              aria-label={reveal ? "Hide details" : "Show details"}
            >
              {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <p className="font-mono text-lg tracking-wider mb-4">
            {reveal ? formatPan(secrets.pan) : `•••• •••• •••• ${secrets.last_four}`}
          </p>

          <div className="flex justify-between text-sm gap-4">
            <div>
              <p className="opacity-70 text-xs">Cardholder</p>
              <p className="font-medium truncate">{secrets.cardholder_name}</p>
            </div>
            <div>
              <p className="opacity-70 text-xs">Expires</p>
              <p className="font-mono">{expiry}</p>
            </div>
            <div>
              <p className="opacity-70 text-xs">CVV</p>
              <p className="font-mono">{reveal ? secrets.cvv : "•••"}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Full details are encrypted at rest. Close this screen when you&apos;re done — you&apos;ll need your transaction PIN to view them again.
        </p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={copyAll}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy all"}
          </Button>
          <Button onClick={handleClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ViewCardDetailsModal;
