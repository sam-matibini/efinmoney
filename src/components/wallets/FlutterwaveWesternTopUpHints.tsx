import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type Props = { currency: "USD" | "CAD" };

export default function FlutterwaveWesternTopUpHints({ currency }: Props) {
  return (
    <Card className="border-orange-500/40 bg-orange-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-5 w-5 text-orange-600 shrink-0" />
          Paying with card ({currency})
        </CardTitle>
        <CardDescription>
          Enter your card details securely below. Your card is charged the amount you enter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ol className="list-decimal list-inside space-y-2 text-foreground leading-relaxed">
          {currency === "CAD" ? (
            <>
              <li>Use a <strong>Canadian debit or credit card</strong>.</li>
              <li>If billing address is requested: real Canadian address, country <strong>Canada</strong>, correct postal code.</li>
              <li>Name on the form must match your card.</li>
            </>
          ) : (
            <>
              <li>Use a <strong>US debit or credit card</strong> (or USD card from your bank).</li>
              <li>If billing address is requested, use details that match your card issuer.</li>
              <li>Some virtual cards may be declined by the bank — try Stripe instead if that happens.</li>
            </>
          )}
          <li>After payment you return here automatically; your {currency} balance updates within a minute.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
