import { useMemo, useState, type ReactNode } from "react";
import { Download, FileSpreadsheet, Layers, Tags } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import TransferSummary from "@/components/pricing/TransferSummary";
import { quoteTransfer } from "@/lib/pricing/costRecoveryEngine";
import {
  ADMIN_CONFIGURATION_FIELDS,
  CUSTOMER_CORRIDOR_RATES,
  PAYOUT_MINIMUMS,
  PRICING_LAYERS,
  RATE_CARD_EFFECTIVE_FROM,
  VOLUME_DISCOUNT_TIERS,
  WALLET_RATES,
} from "@/lib/pricing/rateCard";
import { downloadRateCardWorkbook } from "@/lib/pricing/exportRateCardWorkbook";

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const money = (n: number, ccy = "CAD") => (ccy === "USD" ? `US$${n.toFixed(2)}` : `C$${n.toFixed(2)}`);

export default function PricingRatesPanel() {
  const [section, setSection] = useState("corridor");
  const [amount, setAmount] = useState("100");
  const [source, setSource] = useState("CAD");
  const [dest, setDest] = useState("USDC");
  const [channel, setChannel] = useState<"wallet" | "external">("wallet");
  const [method, setMethod] = useState("WALLET_TO_WALLET");
  const [volume, setVolume] = useState("0");
  const [mid, setMid] = useState("0.7213");

  const quote = useMemo(
    () =>
      quoteTransfer({
        sourceCurrency: source,
        destinationCurrency: dest,
        amount: Number(amount) || 0,
        channel,
        payoutMethod: method,
        monthlyVolume: Number(volume) || 0,
        midMarketRate: Number(mid) || null,
      }),
    [amount, source, dest, channel, method, volume, mid],
  );

  const download = () => {
    try {
      downloadRateCardWorkbook("eFinMoney-Rates-and-Pricing-Summary");
      toast.success("Excel workbook downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the workbook");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Pricing & Rates</h1>
            <p className="text-sm text-muted-foreground">
              Starting commercial rates from {RATE_CARD_EFFECTIVE_FROM}. Costs, FX spread, minimums and volume discounts
              are administrator-controlled — not hard-coded into checkout.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" asChild>
            <a href="/docs/eFinMoney-Rates-and-Pricing-Summary.xlsx" download>
              <FileSpreadsheet className="w-4 h-4" />
              Saved Excel
            </a>
          </Button>
          <Button className="gap-2" onClick={download}>
            <Download className="w-4 h-4" />
            Download Excel
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PRICING_LAYERS.map((layer) => (
          <Card key={layer.layer}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{layer.layer}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-1">
              {layer.items.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={section} onValueChange={setSection} className="space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-auto h-auto flex-wrap">
            <TabsTrigger value="fx">FX Rates</TabsTrigger>
            <TabsTrigger value="corridor">Corridor Rates</TabsTrigger>
            <TabsTrigger value="wallet">Wallet Rates</TabsTrigger>
            <TabsTrigger value="fees">Transfer Fees</TabsTrigger>
            <TabsTrigger value="payout">Payout Fees</TabsTrigger>
            <TabsTrigger value="costs">Partner Costs</TabsTrigger>
            <TabsTrigger value="volume">Volume Discounts</TabsTrigger>
            <TabsTrigger value="customer">Customer Pricing</TabsTrigger>
            <TabsTrigger value="promo">Promotional Pricing</TabsTrigger>
            <TabsTrigger value="history">Pricing History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fx">
          <Card>
            <CardHeader>
              <CardTitle>Two exchange rates</CardTitle>
              <CardDescription>
                MID_MARKET_RATE comes from the approved FX source. CUSTOMER_RATE = MID × (1 − FX_SPREAD).
                Customers see the customer rate, never an unexplained markup.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Example: 1 CAD = 0.7213 USDC mid, 0.60% spread → 0.7213 × (1 − 0.006) = 0.71697 USDC.</p>
              <p>Live mid-market pairs are maintained under Partners → Partner FX. This card applies eFinMoney’s spread on top.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="corridor">
          <RateTable
            title="Customer-facing CAD funding corridors"
            rows={CUSTOMER_CORRIDOR_RATES.map((c) => [
              c.corridor_id,
              `${c.source_currency} → ${c.destination_currency}`,
              c.delivery,
              pct(c.efin_fx_spread),
              money(c.transfer_fee, c.fee_currency),
              money(c.minimum_fee, c.fee_currency),
              c.recommended_position,
            ])}
            headers={["Corridor", "Pair", "Delivery", "FX spread", "Transfer fee", "Minimum fee", "Position"]}
          />
        </TabsContent>

        <TabsContent value="wallet">
          <RateTable
            title="Internal wallet-to-wallet"
            description="Priced below external remittance so customers keep funds inside eFinMoney."
            rows={WALLET_RATES.map((c) => [
              c.corridor_id,
              c.source_currency === "*" ? "Same currency" : `${c.source_currency} → ${c.destination_currency}`,
              pct(c.efin_fx_spread),
              money(c.transfer_fee, c.fee_currency),
              money(c.minimum_fee, c.fee_currency),
              c.estimated_delivery,
            ])}
            headers={["Corridor", "Transaction", "FX spread", "Transfer fee", "Minimum fee", "Delivery"]}
          />
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardHeader>
              <CardTitle>Transfer fee rule</CardTitle>
              <CardDescription>
                Customer fee = MAX(minimum fee, amount × transfer fee %, cost-recovery floor). A C$3 wallet
                conversion is never C$0.01.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>C$3 CAD → USDC wallet: 0.50% × 3 = C$0.015 → minimum C$0.50 → customer fee C$0.50.</p>
              <p>C$100 CAD → USD bank: 0.50% × 100 = C$0.50 → minimum C$1.50 → customer fee C$1.50.</p>
              <p>C$500 CAD → USD bank: 0.50% × 500 = C$2.50 → customer fee C$2.50.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payout">
          <RateTable
            title="Minimum fee by payout method"
            rows={PAYOUT_MINIMUMS.map((p) => [p.label, money(p.minimum_fee, p.fee_currency)])}
            headers={["Payout method", "Minimum fee"]}
          />
        </TabsContent>

        <TabsContent value="costs">
          <RateTable
            title="Layer 1 cost estimates (replace with contracted partner sheets)"
            rows={CUSTOMER_CORRIDOR_RATES.map((c) => [
              c.corridor_id,
              c.partner ?? "—",
              pct(c.costs.partner_cost_pct),
              money(c.costs.partner_fixed_fee),
              pct(c.costs.payment_cost_pct),
              money(c.costs.payment_fixed_fee),
              pct(c.costs.liquidity_cost_pct),
              pct(c.costs.risk_cost_pct),
              money(c.costs.required_margin),
            ])}
            headers={["Corridor", "Partner", "Partner %", "Partner fixed", "Payment %", "Payment fixed", "Liquidity %", "Risk %", "Required margin"]}
          />
        </TabsContent>

        <TabsContent value="volume">
          <RateTable
            title="Monthly volume discounts"
            description="B2B and corporate customers use negotiated FX spreads rather than the consumer card."
            rows={VOLUME_DISCOUNT_TIERS.map((t) => [
              t.label,
              t.custom ? "Custom" : pct(t.fx_spread_discount ?? 0),
              t.custom ? "Custom" : pct(t.transfer_fee_discount ?? 0),
            ])}
            headers={["Monthly customer volume", "FX spread discount", "Transfer fee discount"]}
          />
        </TabsContent>

        <TabsContent value="customer">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tags className="w-4 h-4" /> Quote simulator
              </CardTitle>
              <CardDescription>
                Consumer checkout shows exchange rate, transfer fee and amount received. FX margin is recorded internally.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="You send">
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                <Field label="Mid-market rate">
                  <Input value={mid} onChange={(e) => setMid(e.target.value)} />
                </Field>
                <Field label="From">
                  <Input value={source} onChange={(e) => setSource(e.target.value.toUpperCase())} />
                </Field>
                <Field label="To">
                  <Input value={dest} onChange={(e) => setDest(e.target.value.toUpperCase())} />
                </Field>
                <Field label="Channel">
                  <Select value={channel} onValueChange={(v) => setChannel(v as "wallet" | "external")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wallet">Wallet transfer</SelectItem>
                      <SelectItem value="external">External payout</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Payout method">
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYOUT_MINIMUMS.map((p) => (
                        <SelectItem key={p.payout_method} value={p.payout_method}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Monthly volume (CAD)">
                  <Input value={volume} onChange={(e) => setVolume(e.target.value)} />
                </Field>
              </div>
              <div className="space-y-3">
                <TransferSummary quote={quote} />
                <div className="rounded-xl border p-3 text-xs text-muted-foreground space-y-1">
                  <p>Internal economics (not shown to customers)</p>
                  <p>FX margin {money(quote.fxMargin, quote.feeCurrency)} · Cost {money(quote.cost.totalCost)} · Floor {money(quote.minimumRevenue)}</p>
                  <p>Gross contribution {money(quote.grossContribution)} {quote.floorApplied ? "· floor applied" : ""}</p>
                  <p>Volume tier: {quote.volumeTierLabel}{quote.requiresNegotiation ? " · negotiate" : ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promo">
          <Card>
            <CardHeader>
              <CardTitle>Promotional pricing</CardTitle>
              <CardDescription>
                Layer 2 promotions insert a new effective-dated rate-card row. Layer 1 partner costs stay unchanged.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Create a corridor row with a later <code>effective_from</code> and a lower FX spread or minimum fee.
              The engine always uses the most specific active row as-of the quote time.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Pricing history</CardTitle>
              <CardDescription>
                Every insert/update on <code>corridor_rate_cards</code> writes <code>corridor_rate_card_history</code>.
                Apply the 2026-09-11 migration to start capturing production changes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RateTable
                title="Admin configuration fields"
                rows={ADMIN_CONFIGURATION_FIELDS.map((f) => [f.field, f.example, f.notes])}
                headers={["Field", "Example", "Notes"]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function RateTable({
  title,
  description,
  headers,
  rows,
}: {
  title: string;
  description?: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j} className="tabular-nums">
                    {j === headers.length - 1 && String(cell).includes("competitive") ? (
                      <Badge variant="secondary">{cell}</Badge>
                    ) : (
                      cell
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
