import { Link } from "react-router-dom";
import { ArrowRightLeft, Landmark, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Hub for bank-transfer checkout: wallet top-up, send to a recipient, company bank moves. */
export default function BankCheckoutHub() {
  return (
    <Card className="border-pay-bank/40 bg-pay-bank/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="h-4 w-4 text-pay-bank" />
          Bank transfer checkout
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pay from your bank app — no card, and no need to pre-fund the wallet when checkout
          can collect the amount first.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" className="h-auto justify-start py-3">
            <Link to="/wallet/topup?currency=NGN&method=bank_checkout">
              <Wallet className="mr-2 h-4 w-4 shrink-0" />
              <span className="text-left">
                <span className="block text-sm font-medium">Top up a wallet</span>
                <span className="block text-xs text-muted-foreground font-normal">
                  Bank transfer into NGN or GHS
                </span>
              </span>
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-auto justify-start py-3">
            <Link to="/send?fundingSource=bank">
              <Landmark className="mr-2 h-4 w-4 shrink-0" />
              <span className="text-left">
                <span className="block text-sm font-medium">Send to a recipient</span>
                <span className="block text-xs text-muted-foreground font-normal">
                  Collect from your bank, then pay out
                </span>
              </span>
            </Link>
          </Button>
          <Button variant="outline" className="h-auto justify-start py-3 pointer-events-none">
            <ArrowRightLeft className="mr-2 h-4 w-4 shrink-0" />
            <span className="text-left">
              <span className="block text-sm font-medium">Company bank to bank</span>
              <span className="block text-xs text-muted-foreground font-normal">
                Use Withdraw or Send to another bank below
              </span>
            </span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
