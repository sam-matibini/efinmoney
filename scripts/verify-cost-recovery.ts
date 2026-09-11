import { customerRateFromMid, quoteTransfer } from "../src/lib/pricing/costRecoveryEngine.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const close = (a: number, b: number, eps = 0.011) => Math.abs(a - b) <= eps;

const mid = 0.7213;
assert("customer rate 0.60% spread", close(customerRateFromMid(mid, 0.006), 0.716972, 0.000001));

const cad3 = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "USDC",
  amount: 3,
  channel: "wallet",
  payoutMethod: "WALLET_TO_WALLET",
  midMarketRate: mid,
});
assert("C$3 wallet fee is the C$0.50 minimum, not C$0.01", close(cad3.transferFee, 0.5));

const cad100w = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "USDC",
  amount: 100,
  channel: "wallet",
  payoutMethod: "WALLET_TO_WALLET",
  midMarketRate: mid,
});
assert("C$100 wallet fee is C$0.50", close(cad100w.transferFee, 0.5));

const cad100bank = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "USD",
  amount: 100,
  channel: "external",
  payoutMethod: "BANK",
  midMarketRate: mid,
});
assert("C$100 CAD→USD bank fee is C$1.50", close(cad100bank.transferFee, 1.5));

const cad500 = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "USD",
  amount: 500,
  channel: "external",
  payoutMethod: "BANK",
  midMarketRate: mid,
});
assert("C$500 CAD→USD bank fee is C$2.50", close(cad500.transferFee, 2.5));

const zmw = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "ZMW",
  amount: 100,
  channel: "external",
  payoutMethod: "MOBILE_MONEY",
  partner: "PawaPay",
  midMarketRate: 18.5,
});
assert("ZMW C$100 partner cost ~ C$1.25", close(zmw.cost.partnerCost, 1.25));
assert("ZMW C$100 payment cost ~ C$0.75", close(zmw.cost.paymentCost, 0.75));
assert("ZMW C$100 total cost ~ C$2.30", close(zmw.cost.totalCost, 2.3));
assert("ZMW C$100 revenue ~ C$4.99", close(zmw.totalRevenue, 4.99));
assert("ZMW C$100 contribution ~ C$2.69", close(zmw.grossContribution, 2.69));

const volume = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "USD",
  amount: 500,
  channel: "external",
  payoutMethod: "BANK",
  monthlyVolume: 25000,
  midMarketRate: mid,
});
assert("C$25k volume discounts the 0.50% fee", volume.transferFeePct < 0.005 && volume.transferFee < 2.5);

if (process.exitCode) {
  console.error("cost-recovery checks failed");
} else {
  console.log("cost-recovery checks passed");
}
