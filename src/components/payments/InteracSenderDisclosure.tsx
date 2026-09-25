import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * Information shown to the sender before an Interac-funded transfer.
 * The amount and beneficiary stay in the form above. This notice stays collapsed
 * until the sender opens the FINTRAC details.
 */
export default function InteracSenderDisclosure({
  senderName,
  recipientName,
  destination,
  phone,
  sendAmount,
  fee,
  total,
  currency,
  symbol,
  receiveAmount,
  receiveSymbol,
  receiveCurrency,
  rate,
  reference,
  referencePending = "Issued on the next step",
}: {
  senderName: string;
  recipientName: string;
  destination: string;
  phone?: string;
  sendAmount: number;
  fee: number;
  total: number;
  currency: string;
  symbol: string;
  receiveAmount: number;
  receiveSymbol: string;
  receiveCurrency: string;
  rate: number;
  reference?: string | null;
  referencePending?: string;
}) {
  const [open, setOpen] = useState(false);
  const money = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-muted/30 text-xs leading-relaxed">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left">
        <span>
          <span className="font-medium text-foreground">Transfer details</span>
          <span className="mt-0.5 block text-muted-foreground">
            You pay {symbol}{money(total)} {currency}. They receive {receiveSymbol}{money(receiveAmount)} {receiveCurrency}.
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 border-t px-3 py-2.5">
      <p>
        eFintax Advisors Ltd., doing business as eFinMoney, Winnipeg, Manitoba, is the money services business for this transfer and is registered with FINTRAC.
      </p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Date</dt>
        <dd>{today}</dd>
        <dt className="text-muted-foreground">Sender</dt>
        <dd>{senderName || "—"}</dd>
        <dt className="text-muted-foreground">Beneficiary</dt>
        <dd>{recipientName || "—"}</dd>
        <dt className="text-muted-foreground">Destination</dt>
        <dd>{destination}{phone ? ` · ${phone}` : ""}</dd>
        <dt className="text-muted-foreground">You send</dt>
        <dd>{symbol}{money(sendAmount)} {currency}</dd>
        <dt className="text-muted-foreground">Fee</dt>
        <dd>+{symbol}{money(fee)} {currency}</dd>
        <dt className="text-muted-foreground">You pay</dt>
        <dd className="font-medium">{symbol}{money(total)} {currency}</dd>
        <dt className="text-muted-foreground">Exchange rate</dt>
        <dd>1 {currency} = {rate.toFixed(4)} {receiveCurrency}</dd>
        <dt className="text-muted-foreground">They receive</dt>
        <dd>{receiveSymbol}{money(receiveAmount)} {receiveCurrency}</dd>
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="font-mono">{reference || referencePending}</dd>
      </dl>
      <p className="text-muted-foreground">
        You send the Interac e-Transfer from your own bank. You can cancel this transfer until that e-Transfer is sent. Questions: support@efin.money.
      </p>
      </CollapsibleContent>
    </Collapsible>
  );
}
