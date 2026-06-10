import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, Sparkles } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StellarWalletModal = ({ open, onOpenChange }: Props) => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      // Try to load existing
      const { data: wallets } = await supabase
        .from("wallets")
        .select("stellar_address, currency_code, is_default")
        .eq("user_id", user.id);
      const existing = wallets?.find((w: any) => w.stellar_address)?.stellar_address;
      if (cancelled) return;
      if (existing) {
        setAddress(existing);
        return;
      }
      // Generate
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke("generate-stellar-wallet");
        if (error) throw error;
        if (cancelled) return;
        setAddress(data.stellar_address);
        toast.success(
          data.already_existed
            ? "Stellar wallet loaded"
            : data.funded
            ? "Stellar wallet created & funded with 10,000 test XLM"
            : "Stellar wallet created (funding pending)"
        );
        qc.invalidateQueries({ queryKey: ["wallets"] });
      } catch (e: any) {
        toast.error(e.message ?? "Failed to generate Stellar wallet");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, qc]);

  const copy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    toast.success("Address copied");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Your Stellar Wallet
          </DialogTitle>
          <DialogDescription>
            Testnet blockchain identity powered by Stellar.
          </DialogDescription>
        </DialogHeader>

        {loading || !address ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <LoadingSpinner size={32} />
            <p className="text-sm text-muted-foreground">
              Generating your blockchain wallet…
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center bg-white p-4 rounded-xl">
              <QRCodeSVG value={address} size={192} />
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Public address</p>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <code className="text-xs break-all flex-1">{address}</code>
                <Button size="icon" variant="ghost" onClick={copy}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <Button
              asChild
              variant="outline"
              className="w-full"
            >
              <a
                href={`https://stellar.expert/explorer/testnet/account/${address}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on Stellar Explorer
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StellarWalletModal;
