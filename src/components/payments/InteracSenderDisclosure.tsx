/**
 * Information shown to the sender before an Interac-funded transfer.
 * Covers the facts an MSB must make available on an outgoing transfer:
 * who is sending, who receives, amounts, fee, rate, date, and the MSB identity.
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
  const money = (n: number) => n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
      <p className="font-medium text-foreground">Transfer details</p>
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
    </div>
  );
}
