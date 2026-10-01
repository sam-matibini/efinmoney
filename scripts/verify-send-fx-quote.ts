import { formatFxRate, pickSendBenchmark, quoteSendLookup } from "../src/lib/sendFxQuote.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const close = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps;

const stuck = pickSendBenchmark({
  liveMid: 934.8248,
  partnerRate: 1000,
  partnerSource: "live_api",
});
assert("a round 1000 quote is dropped when the live mid is 934.82", stuck.basis === "live_mid" && close(stuck.benchmark, 934.8248));

const fresh = pickSendBenchmark({
  liveMid: 972.16,
  partnerRate: 971.892,
  partnerSource: "live_api",
});
assert("a fresh partner quote within 3% of mid is used", fresh.basis === "live_partner" && close(fresh.benchmark, 971.892));

const manual = pickSendBenchmark({
  liveMid: 934.8248,
  partnerRate: 1000,
  partnerSource: "manual",
});
assert("a manual placeholder does not override the live mid", manual.basis === "live_mid");

const kenya = quoteSendLookup({
  sourceCurrency: "CAD",
  destinationCurrency: "KES",
  payoutMethod: "mobile_money",
  amount: 0,
  liveMid: 91.2563,
  partnerRate: 1000,
  partnerSource: "live_api",
});
assert("changing destination leaves the NGN placeholder", kenya.basis === "live_mid" && close(kenya.customerRate, 91.2563 * (1 - kenya.spread), 0.05));
assert("a zero amount still shows the corridor fee", kenya.scheduledFee > 0 && kenya.fee === 0);

const nigeria = quoteSendLookup({
  sourceCurrency: "CAD",
  destinationCurrency: "NGN",
  payoutMethod: "bank",
  amount: 0,
  liveMid: 934.8248,
  partnerRate: 1000,
  partnerSource: "treasury_mid",
});
assert(
  "CAD→NGN customer rate is the live mid minus the 0.60% bank spread",
  close(nigeria.customerRate, 934.8248 * 0.994, 0.05) && close(nigeria.spread, 0.006, 0.0001),
);
assert("Nigeria bank fee is scheduled before an amount is entered", close(nigeria.scheduledFee, 3.49, 0.001));
assert("rate text keeps four decimals", formatFxRate(934.8248) === "934.8248");

const sending = quoteSendLookup({
  sourceCurrency: "CAD",
  destinationCurrency: "NGN",
  payoutMethod: "bank",
  amount: 50,
  liveMid: 934.8248,
});
assert("entered amount uses the same customer rate and charges the fee", close(sending.customerRate, nigeria.customerRate, 0.01) && sending.fee >= 3.49 && sending.youReceive > 0);

if (process.exitCode) {
  console.error("send FX quote checks failed");
} else {
  console.log("send FX quote checks passed");
}
