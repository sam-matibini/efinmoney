import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type Props = { currency: "USD" | "CAD" };

export default function FlutterwaveWesternTopUpHints({ currency }: Props) {
  return (
    <Card className="border-orange-500/40 bg-orange-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-5 w-5 text-orange-600 shrink-0" />
          Flutterwave card checkout ({currency})
        </CardTitle>
        <CardDescription>
          You’ll continue to Flutterwave’s secure page to enter card details (hosted redirect — no card data in eFin).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ol className="list-decimal list-inside space-y-2 text-foreground leading-relaxed">
          {currency === "CAD" ? (
            <>
              <li>Enter the CAD amount to add, then open Flutterwave checkout.</li>
              <li>Use a <strong>Canadian debit or credit card</strong> on their page.</li>
            </>
          ) : (
            <>
              <li>Enter the USD amount to add, then open Flutterwave checkout.</li>
              <li>Use a <strong>US / USD debit or credit card</strong> on their page.</li>
            </>
          )}
          <li>After payment you return here; your {currency} wallet updates when Flutterwave confirms.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
