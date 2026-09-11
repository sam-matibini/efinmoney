import { useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, RotateCcw, Save, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import TransferSummary from "@/components/pricing/TransferSummary";
import { quoteTransfer } from "@/lib/pricing/costRecoveryEngine";
import { ADMIN_CONFIGURATION_FIELDS, PRICING_LAYERS } from "@/lib/pricing/rateCard";
import { downloadRateCardWorkbook } from "@/lib/pricing/exportRateCardWorkbook";
import { useLivePricingWorkbook } from "@/hooks/useLivePricingWorkbook";
import type { PayoutMethod, RecommendedPosition } from "@/lib/pricing/types";

const SHEETS = [
  { id: "summary", label: "Summary" },
  { id: "corridor", label: "Customer Corridor Rates" },
  { id: "wallet", label: "Wallet Rates" },
  { id: "volume", label: "Volume Discounts" },
  { id: "payout", label: "Payout Minimums" },
  { id: "engine", label: "Pricing Engine" },
  { id: "examples", label: "Examples" },
  { id: "admin", label: "Admin Configuration" },
] as const;

type SheetId = (typeof SHEETS)[number]["id"];

const POSITIONS: RecommendedPosition[] = [
  "Highly competitive",
  "Competitive",
  "Higher-risk corridor",
  "Higher-cost corridor",
  "Ecosystem",
];

const METHODS: PayoutMethod[] = [
  "BANK",
  "MOBILE_MONEY",
  "WALLET",
  "CASH_PICKUP",
  "CARD_PAYOUT",
  "STABLECOIN",
  "CORPORATE",
  "WALLET_BANK",
];

const cellClass =
  "h-8 w-full min-w-[4.5rem] rounded-sm border border-transparent bg-transparent px-1.5 text-sm tabular-nums hover:border-border focus:border-primary focus:bg-background focus:outline-none";

function money(n: number, ccy = "CAD") {
  return ccy === "USD" ? `US$${n.toFixed(2)}` : `C$${n.toFixed(2)}`;
}

function OriginBadge({ origin }: { origin?: "live" | "template" | "corrected" }) {
  if (origin === "live") return <Badge className="bg-emerald-600/15 text-emerald-700 hover:bg-emerald-600/15">Live</Badge>;
  if (origin === "corrected") return <Badge variant="secondary">Corrected</Badge>;
  return <Badge variant="outline">Template</Badge>;
}

export default function PricingRatesPanel() {
  const pricing = useLivePricingWorkbook();
  const [sheet, setSheet] = useState<SheetId>("corridor");
  const [filter, setFilter] = useState("");
  const [amount, setAmount] = useState("100");
  const [source, setSource] = useState("CAD");
  const [dest, setDest] = useState("USDC");
  const [mid, setMid] = useState("0.7213");
  const [addSource, setAddSource] = useState("CAD");
  const [addDest, setAddDest] = useState("");
  const [addMethod, setAddMethod] = useState<PayoutMethod>("BANK");

  useEffect(() => {
    const row = pricing.fxRates.find((r) => r.from_currency === source && r.to_currency === dest);
    const inverse = pricing.fxRates.find((r) => r.from_currency === dest && r.to_currency === source);
    if (row && Number(row.rate) > 0) setMid(String(Number(row.rate)));
    else if (inverse && Number(inverse.rate) > 0) setMid(String(1 / Number(inverse.rate)));
  }, [source, dest, pricing.fxRates]);

  const quote = useMemo(
    () =>
      quoteTransfer(
        {
          sourceCurrency: source,
          destinationCurrency: dest,
          amount: Number(amount) || 0,
          channel: dest === source || dest.length > 3 || dest === "USDC" || dest === "USDT" ? "wallet" : "external",
          payoutMethod: dest === "USDC" || dest === "USDT" ? "WALLET_TO_WALLET" : "BANK",
          midMarketRate: Number(mid) || null,
        },
        [...pricing.workbook.wallets, ...pricing.workbook.corridors],
      ),
    [amount, source, dest, mid, pricing.workbook],
  );

  const corridors = pricing.workbook.corridors.filter((c) => {
    const q = filter.trim().toUpperCase();
    if (!q) return true;
    return `${c.corridor_id} ${c.destination_currency} ${c.partner} ${c.delivery}`.toUpperCase().includes(q);
  });

  const onSave = async () => {
    const result = await pricing.save();
    if (result.db) toast.success("Pricing corrections saved. Checkout and wallet quotes will use the updated card.");
    else toast.success("Corrections saved in this workspace. Apply the corridor rate-card SQL to persist them in the database.");
  };

  const addRow = (channel: "wallet" | "external") => {
    const destCode = addDest.trim().toUpperCase();
    if (!/^[A-Z]{3,4}$/.test(destCode)) {
      toast.error("Enter a 3–4 letter destination currency");
      return;
    }
    const card = pricing.addManualRow({
      source: addSource.trim().toUpperCase() || "CAD",
      dest: destCode,
      method: channel === "wallet" ? "WALLET_TO_WALLET" : addMethod,
      channel,
    });
    toast.success(`Added ${card.source_currency} → ${card.destination_currency}. Adjust the fees, then save.`);
    setAddDest("");
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Pricing & Fees</h1>
          <p className="text-sm text-muted-foreground">
            {pricing.loading
              ? "Loading live partners, corridors and currencies…"
              : `${pricing.workbook.corridors.length} corridors · ${pricing.liveCorridorCount} live partners${
                  pricing.livePartners.length ? ` (${pricing.livePartners.slice(0, 4).join(", ")})` : ""
                } · ${pricing.workbook.wallets.length} wallet rates · ${pricing.liveWalletCount} live`}
          </p>
          <p className="text-xs text-muted-foreground">
            Auto-refreshes from partners, corridors, FX and currencies every 60s
            {pricing.lastRefreshed ? ` · last ${pricing.lastRefreshed.toLocaleTimeString()}` : ""}
            {pricing.dirty ? " · unsaved corrections" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void pricing.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh live data
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              pricing.resetToLive();
              toast.message("Reverted to live partner/corridor pricing");
            }}
          >
            <RotateCcw className="h-4 w-4" /> Reset to live
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              downloadRateCardWorkbook();
              toast.success("Excel workbook downloaded");
            }}
          >
            <Download className="h-4 w-4" /> Excel
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => void onSave()} disabled={pricing.saving || !pricing.dirty}>
            <Save className="h-4 w-4" /> {pricing.saving ? "Saving…" : "Save corrections"}
          </Button>
        </div>
      </div>

      <div className="min-h-[420px] p-4">
        {sheet === "summary" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Customer rates rebuild automatically from integrated partners, enabled corridors, partner cost sheets,
              live FX and active currencies. Use the other sheets to correct spreads, minimums and fees. Saved
              corrections stay in place when new corridors appear.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {PRICING_LAYERS.map((layer) => (
                <div key={layer.layer} className="rounded-lg border p-3">
                  <p className="mb-2 text-sm font-semibold">{layer.layer}</p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {layer.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <SheetTable
              headers={["Pair", "Mid-market", "Source"]}
              rows={(pricing.fxRates ?? []).slice(0, 24).map((r) => [
                `${r.from_currency} → ${r.to_currency}`,
                Number(r.rate || r.effective_rate).toFixed(6),
                r.source || "fx_rates",
              ])}
            />
          </div>
        )}

        {sheet === "corridor" && (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <Input placeholder="Filter corridor, currency or partner" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-sm" />
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-20" value={addSource} onChange={(e) => setAddSource(e.target.value.toUpperCase())} placeholder="From" />
                <Input className="w-24" value={addDest} onChange={(e) => setAddDest(e.target.value.toUpperCase())} placeholder="To" />
                <select className={cn(cellClass, "w-40 border-border")} value={addMethod} onChange={(e) => setAddMethod(e.target.value as PayoutMethod)}>
                  {METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addRow("external")}>
                  <Plus className="h-4 w-4" /> Add corridor
                </Button>
              </div>
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Corridor", "Partner", "FX spread %", "Fee %", "Min fee", "Max fee", "Position", "Source", "On", ""].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {corridors.map((c) => {
                    const dirty = pricing.isCardDirty("corridors", c.corridor_id);
                    return (
                      <TableRow key={c.corridor_id} className={dirty ? "bg-amber-50/70 dark:bg-amber-950/20" : undefined}>
                        <TableCell className="whitespace-nowrap font-medium">
                          {c.source_currency} → {c.destination_currency}
                          <div className="text-xs text-muted-foreground">{c.delivery} · {c.payout_method}</div>
                        </TableCell>
                        <TableCell>
                          <input className={cellClass} value={c.partner ?? ""} onChange={(e) => pricing.patchCard("corridors", c.corridor_id, { partner: e.target.value || null })} />
                        </TableCell>
                        <TableCell>
                          <Pct value={c.efin_fx_spread} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { efin_fx_spread: n })} />
                        </TableCell>
                        <TableCell>
                          <Pct value={c.efin_transfer_fee_pct} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { efin_transfer_fee_pct: n })} />
                        </TableCell>
                        <TableCell>
                          <Num value={c.minimum_fee} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { minimum_fee: n, transfer_fee: n })} />
                        </TableCell>
                        <TableCell>
                          <Num value={c.maximum_fee} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { maximum_fee: n })} />
                        </TableCell>
                        <TableCell>
                          <select
                            className={cellClass}
                            value={c.recommended_position}
                            onChange={(e) => pricing.patchCard("corridors", c.corridor_id, { recommended_position: e.target.value as RecommendedPosition })}
                          >
                            {POSITIONS.map((p) => (
                              <option key={p}>{p}</option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell><OriginBadge origin={c.origin} /></TableCell>
                        <TableCell>
                          <Switch checked={c.active} onCheckedChange={(on) => pricing.patchCard("corridors", c.corridor_id, { active: on })} />
                        </TableCell>
                        <TableCell>
                          {dirty && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Revert this row" onClick={() => pricing.revertCard("corridors", c.corridor_id)}>
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {sheet === "wallet" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-20" value={addSource} onChange={(e) => setAddSource(e.target.value.toUpperCase())} placeholder="From" />
              <Input className="w-24" value={addDest} onChange={(e) => setAddDest(e.target.value.toUpperCase())} placeholder="To" />
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addRow("wallet")}>
                <Plus className="h-4 w-4" /> Add wallet rate
              </Button>
            </div>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Transaction", "FX spread %", "Fee %", "Min fee", "Max fee", "Source", "On", ""].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pricing.workbook.wallets.map((c) => {
                    const dirty = pricing.isCardDirty("wallets", c.corridor_id);
                    return (
                      <TableRow key={c.corridor_id} className={dirty ? "bg-amber-50/70 dark:bg-amber-950/20" : undefined}>
                        <TableCell className="font-medium">
                          {c.source_currency === "*" ? "Same currency" : `${c.source_currency} → ${c.destination_currency}`}
                        </TableCell>
                        <TableCell>
                          <Pct value={c.efin_fx_spread} onChange={(n) => pricing.patchCard("wallets", c.corridor_id, { efin_fx_spread: n })} />
                        </TableCell>
                        <TableCell>
                          <Pct value={c.efin_transfer_fee_pct} onChange={(n) => pricing.patchCard("wallets", c.corridor_id, { efin_transfer_fee_pct: n })} />
                        </TableCell>
                        <TableCell>
                          <Num value={c.minimum_fee} onChange={(n) => pricing.patchCard("wallets", c.corridor_id, { minimum_fee: n, transfer_fee: n })} />
                        </TableCell>
                        <TableCell>
                          <Num value={c.maximum_fee} onChange={(n) => pricing.patchCard("wallets", c.corridor_id, { maximum_fee: n })} />
                        </TableCell>
                        <TableCell><OriginBadge origin={c.origin} /></TableCell>
                        <TableCell>
                          <Switch checked={c.active} onCheckedChange={(on) => pricing.patchCard("wallets", c.corridor_id, { active: on })} />
                        </TableCell>
                        <TableCell>
                          {dirty && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Revert this row" onClick={() => pricing.revertCard("wallets", c.corridor_id)}>
                              <Undo2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {sheet === "volume" && (
          <Table>
            <TableHeader>
              <TableRow>
                {["Monthly customer volume", "FX spread discount %", "Transfer fee discount %"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricing.workbook.volumes.map((t) => (
                <TableRow key={t.id} className={pricing.draft.volumes[t.id] ? "bg-amber-50/70 dark:bg-amber-950/20" : undefined}>
                  <TableCell>{t.label}</TableCell>
                  <TableCell>
                    {t.custom ? "Custom" : (
                      <Pct value={t.fx_spread_discount ?? 0} onChange={(n) => pricing.patchVolume(t.id, { fx_spread_discount: n, transfer_fee_discount: n })} />
                    )}
                  </TableCell>
                  <TableCell>
                    {t.custom ? "Custom" : (
                      <Pct value={t.transfer_fee_discount ?? 0} onChange={(n) => pricing.patchVolume(t.id, { transfer_fee_discount: n })} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {sheet === "payout" && (
          <Table>
            <TableHeader>
              <TableRow>
                {["Payout method", "Minimum fee"].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pricing.workbook.payouts.map((p) => (
                <TableRow key={p.payout_method} className={pricing.draft.payouts[p.payout_method] ? "bg-amber-50/70 dark:bg-amber-950/20" : undefined}>
                  <TableCell>{p.label}</TableCell>
                  <TableCell>
                    <Num value={p.minimum_fee} onChange={(n) => pricing.patchPayout(p.payout_method, { minimum_fee: n })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {sheet === "engine" && (
          <div className="overflow-auto">
            <p className="mb-3 text-sm text-muted-foreground">
              Layer 1 costs come from contracted partner pricing and refresh with the partner rate sheet. Correct a cell when the contracted cost is wrong.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  {["Corridor", "Partner %", "Partner fixed", "Payment %", "Payment fixed", "Liquidity %", "Risk %", "Required margin"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricing.workbook.corridors.map((c) => (
                  <TableRow key={c.corridor_id} className={pricing.isCardDirty("corridors", c.corridor_id) ? "bg-amber-50/70 dark:bg-amber-950/20" : undefined}>
                    <TableCell className="whitespace-nowrap">{c.corridor_id}</TableCell>
                    <TableCell><Pct value={c.costs.partner_cost_pct} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { partner_cost_pct: n } })} /></TableCell>
                    <TableCell><Num value={c.costs.partner_fixed_fee} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { partner_fixed_fee: n } })} /></TableCell>
                    <TableCell><Pct value={c.costs.payment_cost_pct} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { payment_cost_pct: n } })} /></TableCell>
                    <TableCell><Num value={c.costs.payment_fixed_fee} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { payment_fixed_fee: n } })} /></TableCell>
                    <TableCell><Pct value={c.costs.liquidity_cost_pct} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { liquidity_cost_pct: n } })} /></TableCell>
                    <TableCell><Pct value={c.costs.risk_cost_pct} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { risk_cost_pct: n } })} /></TableCell>
                    <TableCell><Num value={c.costs.required_margin} onChange={(n) => pricing.patchCard("corridors", c.corridor_id, { costs: { required_margin: n } })} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {sheet === "examples" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">You send<Input value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
              <label className="text-sm">Mid-market rate<Input value={mid} onChange={(e) => setMid(e.target.value)} /></label>
              <label className="text-sm">From<Input value={source} onChange={(e) => setSource(e.target.value.toUpperCase())} /></label>
              <label className="text-sm">To<Input value={dest} onChange={(e) => setDest(e.target.value.toUpperCase())} /></label>
            </div>
            <div className="space-y-3">
              <TransferSummary quote={quote} />
              <p className="text-xs text-muted-foreground">
                Internal: FX margin {money(quote.fxMargin)} · cost {money(quote.cost.totalCost)} · floor {money(quote.minimumRevenue)}
                {quote.floorApplied ? " · floor applied" : ""}
              </p>
            </div>
          </div>
        )}

        {sheet === "admin" && (
          <SheetTable
            headers={["Field", "Example", "Notes"]}
            rows={ADMIN_CONFIGURATION_FIELDS.map((f) => [f.field, f.example, f.notes])}
          />
        )}
      </div>

      <div className="flex overflow-x-auto border-t bg-[#f3f3f3] dark:bg-muted/40">
        {SHEETS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSheet(s.id)}
            className={cn(
              "whitespace-nowrap border-r border-black/10 px-4 py-2 text-sm",
              sheet === s.id
                ? "bg-background font-semibold text-foreground shadow-[inset_0_-3px_0_0_#217346]"
                : "text-muted-foreground hover:bg-background/70",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Pct({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const display = Number.isFinite(value) ? (value * 100).toFixed(2) : "0";
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);
  return (
    <input
      className={cellClass}
      inputMode="decimal"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        onChange((Number(text) || 0) / 100);
      }}
    />
  );
}

function Num({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const display = Number.isFinite(value) ? String(value) : "0";
  const [text, setText] = useState(display);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(display);
  }, [display, focused]);
  return (
    <input
      className={cellClass}
      inputMode="decimal"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        onChange(Number(text) || 0);
      }}
    />
  );
}

function SheetTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="overflow-auto">
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
                <TableCell key={j} className="tabular-nums">{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
