import * as XLSX from "xlsx";
import { quoteTransfer } from "./costRecoveryEngine.ts";
import { ADMIN_CONFIGURATION_FIELDS, PRICING_LAYERS, RATE_CARD_EFFECTIVE_FROM } from "./rateCard.ts";
import type { CorridorRateCard } from "./types.ts";
import { getWorkbook } from "./workbookStore.ts";

export type WorkbookSheet = { name: string; rows: Array<Array<string | number | boolean | null>> };

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const money = (n: number, ccy = "CAD") =>
  ccy === "USD" ? `US$${n.toFixed(2)}` : `C$${n.toFixed(2)}`;

function corridorRows(cards: CorridorRateCard[]) {
  return [
    [
      "corridor_id",
      "source_currency",
      "destination_currency",
      "payout_method",
      "delivery",
      "partner",
      "efin_fx_spread",
      "efin_transfer_fee_pct",
      "transfer_fee",
      "minimum_fee",
      "maximum_fee",
      "partner_cost_pct",
      "partner_fixed_fee",
      "payment_cost_pct",
      "payment_fixed_fee",
      "liquidity_cost_pct",
      "risk_cost_pct",
      "required_margin",
      "recommended_position",
      "estimated_delivery",
      "effective_from",
      "effective_to",
      "active",
    ],
    ...cards.map((c) => [
      c.corridor_id,
      c.source_currency,
      c.destination_currency,
      c.payout_method,
      c.delivery,
      c.partner,
      pct(c.efin_fx_spread),
      pct(c.efin_transfer_fee_pct),
      money(c.transfer_fee, c.fee_currency),
      money(c.minimum_fee, c.fee_currency),
      money(c.maximum_fee, c.fee_currency),
      pct(c.costs.partner_cost_pct),
      money(c.costs.partner_fixed_fee, c.fee_currency),
      pct(c.costs.payment_cost_pct),
      money(c.costs.payment_fixed_fee, c.fee_currency),
      pct(c.costs.liquidity_cost_pct),
      pct(c.costs.risk_cost_pct),
      money(c.costs.required_margin, c.fee_currency),
      c.recommended_position,
      c.estimated_delivery,
      c.effective_from,
      c.effective_to,
      c.active,
    ]),
  ];
}

export function buildRateCardSheets(): WorkbookSheet[] {
  const wb = getWorkbook();
  const cadUsdc3 = quoteTransfer({
    sourceCurrency: "CAD",
    destinationCurrency: "USDC",
    amount: 3,
    channel: "wallet",
    payoutMethod: "WALLET_TO_WALLET",
    midMarketRate: 0.7213,
  });
  const cadUsdc100 = quoteTransfer({
    sourceCurrency: "CAD",
    destinationCurrency: "USDC",
    amount: 100,
    channel: "wallet",
    payoutMethod: "WALLET_TO_WALLET",
    midMarketRate: 0.7213,
  });
  const cadUsd500 = quoteTransfer({
    sourceCurrency: "CAD",
    destinationCurrency: "USD",
    amount: 500,
    channel: "external",
    payoutMethod: "BANK",
    midMarketRate: 0.7213,
  });
  const zmw100 = quoteTransfer({
    sourceCurrency: "CAD",
    destinationCurrency: "ZMW",
    amount: 100,
    channel: "external",
    payoutMethod: "MOBILE_MONEY",
    partner: "PawaPay",
    midMarketRate: 18.5,
  });

  return [
    {
      name: "Summary",
      rows: [
        ["eFinMoney Rates & Pricing Summary"],
        ["Effective from", RATE_CARD_EFFECTIVE_FROM],
        ["Positioning", "Low fixed fees + transparent FX + volume discounts + corridor-specific pricing"],
        [],
        ["These are starting commercial rates, not hard-coded economics."],
        ["The pricing engine adjusts them from partner cost, liquidity cost, FX volatility and payout method."],
        [],
        ["Customer Price", "Partner Cost + Internal Cost + Risk Cost + FX Spread + eFinMoney Margin"],
        ["Customer Fee", "MAX(Minimum Fee, Variable Fee + Fixed Cost Recovery, Cost Recovery Floor)"],
        ["Customer rate", "CUSTOMER_RATE = MID_MARKET_RATE × (1 − FX_SPREAD)"],
        ["Worked FX example", "1 CAD = 0.7213 USDC mid, 0.60% spread → 0.7213 × (1 − 0.006) = 0.7169722 → 0.71697 USDC"],
        [],
        ["Architecture"],
        ...PRICING_LAYERS.flatMap((layer) => [[layer.layer], ...layer.items.map((item) => ["", item]), []]),
        ["Admin menu", "Settings → Pricing & Rates"],
        ["Controls", "FX Rates, Corridor Rates, Transfer Fees, Payout Fees, Partner Costs, Volume Discounts, Customer Pricing, Promotional Pricing, Pricing History"],
        [],
        ["Consumer checkout shows", "You send, Exchange rate (customer rate), Transfer fee, You receive, Estimated delivery"],
        ["Internal only", "FX margin, partner cost, liquidity, risk, gross contribution"],
      ],
    },
    {
      name: "Customer Corridor Rates",
      rows: corridorRows(wb.corridors),
    },
    {
      name: "Wallet Rates",
      rows: [
        ["Internal wallet transfers are priced below external remittance so funds stay in the eFinMoney ecosystem."],
        [],
        ...corridorRows(wb.wallets),
      ],
    },
    {
      name: "Volume Discounts",
      rows: [
        ["Monthly Customer Volume", "FX Spread Discount", "Transfer Fee Discount", "Notes"],
        ...wb.volumes.map((t) => [
          t.label,
          t.fx_spread_discount == null ? "Custom" : pct(t.fx_spread_discount),
          t.transfer_fee_discount == null ? "Custom" : pct(t.transfer_fee_discount),
          t.custom ? "Negotiated B2B / high-volume contract" : "Automatic for consumer",
        ]),
        [],
        ["B2B / corporate customers use negotiated FX spreads rather than the consumer card."],
      ],
    },
    {
      name: "Payout Minimums",
      rows: [
        ["Payout Method", "Minimum Fee", "Currency"],
        ...wb.payouts.map((p) => [p.label, money(p.minimum_fee, p.fee_currency), p.fee_currency]),
        [],
        ["Wallet-to-wallet has the lowest marginal cost and the lowest minimum to encourage in-ecosystem transfers."],
      ],
    },
    {
      name: "Pricing Engine",
      rows: [
        ["Input"],
        ["Source Currency"],
        ["Destination Currency"],
        ["Amount"],
        ["Payout Method"],
        ["Funding Method"],
        ["Customer Type"],
        ["Customer Volume"],
        ["Partner"],
        [],
        ["Pipeline"],
        ["1", "Get live FX rate (MID_MARKET_RATE)"],
        ["2", "Get corridor pricing (effective dated, active row)"],
        ["3", "Calculate partner + payment + payout + liquidity + risk cost"],
        ["4", "Apply eFinMoney FX spread → CUSTOMER_RATE = MID × (1 − spread)"],
        ["5", "Apply transfer fee"],
        ["6", "Apply minimum fee by corridor and payout method"],
        ["7", "Apply volume discount"],
        ["8", "Apply cost-recovery floor (cost + required margin)"],
        ["9", "Calculate customer receives"],
        ["10", "Show: amount, FX rate, fee, recipient amount, total cost, estimated delivery"],
        [],
        ["Cost-recovery floor example"],
        ["Cost to eFinMoney", "C$2.83"],
        ["Required margin", "C$0.75"],
        ["Minimum revenue", "C$3.58"],
        ["Rule", "Never price below the floor even if the percentage fee is only C$0.50"],
        [],
        ["Zambia C$100 external payout (illustrative contracted costs)"],
        ["FX spread (internal)", money(zmw100.fxMargin)],
        ["eFinMoney fee", money(zmw100.transferFee)],
        ["Partner payout cost", money(zmw100.cost.partnerCost)],
        ["Payment processing", money(zmw100.cost.paymentCost)],
        ["Risk / liquidity", money(zmw100.cost.liquidityCost + zmw100.cost.riskCost)],
        ["Total cost", money(zmw100.cost.totalCost)],
        ["Revenue", money(zmw100.totalRevenue)],
        ["Gross contribution", money(zmw100.grossContribution)],
      ],
    },
    {
      name: "Examples",
      rows: [
        ["Scenario", "You send", "Mid-market", "Customer rate", "Variable fee", "Minimum fee", "Customer fee", "You receive", "Floor applied"],
        [
          "C$3 CAD → USDC wallet (screenshot bug: was C$0.01)",
          money(cadUsdc3.youSend),
          cadUsdc3.midMarketRate,
          cadUsdc3.customerRate,
          money(cadUsdc3.variableFee),
          money(cadUsdc3.minimumFee),
          money(cadUsdc3.transferFee),
          cadUsdc3.youReceive,
          cadUsdc3.floorApplied,
        ],
        [
          "C$100 CAD → USDC wallet",
          money(cadUsdc100.youSend),
          cadUsdc100.midMarketRate,
          cadUsdc100.customerRate,
          money(cadUsdc100.variableFee),
          money(cadUsdc100.minimumFee),
          money(cadUsdc100.transferFee),
          cadUsdc100.youReceive,
          cadUsdc100.floorApplied,
        ],
        [
          "C$500 CAD → USD bank",
          money(cadUsd500.youSend),
          cadUsd500.midMarketRate,
          cadUsd500.customerRate,
          money(cadUsd500.variableFee),
          money(cadUsd500.minimumFee),
          money(cadUsd500.transferFee),
          cadUsd500.youReceive,
          cadUsd500.floorApplied,
        ],
        [
          "C$100 CAD → ZMW mobile money",
          money(zmw100.youSend),
          zmw100.midMarketRate,
          zmw100.customerRate,
          money(zmw100.variableFee),
          money(zmw100.minimumFee),
          money(zmw100.transferFee),
          zmw100.youReceive,
          zmw100.floorApplied,
        ],
        [],
        ["C$3 × 0.50% = C$0.015, which is commercially not cost-recovery. Minimum fee (C$0.50 wallet / C$1.50 bank) applies."],
        ["C$100 × 0.50% = C$0.50 → still below the CAD→USD bank minimum of C$1.50, so customer fee = C$1.50."],
        ["C$500 × 0.50% = C$2.50, which is above the C$1.50 minimum, so customer fee = C$2.50."],
      ],
    },
    {
      name: "Admin Configuration",
      rows: [
        ["Field", "Example", "Notes"],
        ...ADMIN_CONFIGURATION_FIELDS.map((f) => [f.field, f.example, f.notes]),
        [],
        ["Do not hard-code rates such as 0.5% into the application."],
        ["Put all rates in Pricing & Rates with effective dates, corridor, partner, payout method, min/max fee, FX spread and the cost-recovery floor."],
      ],
    },
  ];
}

export function buildRateCardWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sheet of buildRateCardSheets()) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    ws["!cols"] = Array.from({ length: 24 }, (_, i) => ({
      wch: Math.min(
        42,
        Math.max(
          14,
          ...sheet.rows.slice(0, 80).map((r) => String(r[i] ?? "").length + 2),
        ),
      ),
    }));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  return wb;
}

export function downloadRateCardWorkbook(filenameBase = "eFinMoney-Rates-and-Pricing-Summary") {
  const wb = buildRateCardWorkbook();
  XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}

export function writeRateCardWorkbookToFile(filePath: string) {
  const wb = buildRateCardWorkbook();
  XLSX.writeFile(wb, filePath);
}
