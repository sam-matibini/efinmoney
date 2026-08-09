import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Landmark } from "lucide-react";
import InteracCheckout from "@/components/payments/InteracCheckout";

interface Props {
  initialAmount?: string;
  walletId: string;
  walletCurrency: string;
  onComplete?: () => void;
}

/** Wallet top-up via Interac e-Transfer into the Wise CAD balance. */
export default function CadInteracTopUpCard({ walletId, walletCurrency, onComplete, initialAmount }: Props) {
  if (walletCurrency.toUpperCase() !== "CAD") return null;

  return (
    <Card className="border-red-500/30 bg-gradient-to-br from-red-950/10 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-red-600" />
          Interac e-Transfer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Send CAD from your Canadian bank. Autodeposit credits your wallet when the transfer arrives.
        </p>
      </CardHeader>
      <CardContent>
        <InteracCheckout
          walletId={walletId}
          purpose="topup"
          initialAmount={initialAmount}
          onComplete={onComplete}
        />
      </CardContent>
    </Card>
  );
}
