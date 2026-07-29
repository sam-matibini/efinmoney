import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type Props = { currency: "USD" | "CAD" };

export default function FlutterwaveWesternTopUpHints({ currency }: Props) {
  return (
    <Card className="border-primary/25 bg-primary/[0.04]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-5 w-5 text-primary shrink-0" />
          Card checkout ({currency})
        </CardTitle>
        <CardDescription>
          You’ll continue to a secure page to enter card details (hosted redirect — no card data stays in eFin).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ol className="list-decimal list-inside space-y-2 text-foreground leading-relaxed">
          {currency === "CAD" ? (
            <>
              <li>Enter the CAD amount to add, then open checkout.</li>
              <li>Use a <strong>Canadian debit or credit card</strong> on the payment page.</li>
            </>
          ) : (
            <>
              <li>Enter the USD amount to add, then open checkout.</li>
              <li>Use a <strong>US / USD debit or credit card</strong> on the payment page.</li>
            </>
          )}
          <li>After payment you return here; your {currency} wallet updates when payment is confirmed.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
