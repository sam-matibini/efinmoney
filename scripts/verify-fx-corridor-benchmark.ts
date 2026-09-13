import {
  classifyPartnerFxRow,
  composeProviderCrossRate,
  customerRateFromProvider,
  pickCorridorProviderBenchmark,
  resolveFxBenchmark,
  type CorridorProviderQuote,
} from "../src/lib/fxCorridorBenchmark.ts";
import { quoteTransfer } from "../src/lib/pricing/costRecoveryEngine.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const close = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps;

const now = Date.now();
const liveTs = new Date(now - 60_000).toISOString();
const liveExp = new Date(now + 14 * 60_000).toISOString();
const seedTs = new Date(now - 60_000).toISOString();
const seedExp = new Date(now + 6 * 60 * 60_000).toISOString();

assert(
  "live 15-minute API rows classify as live_api",
  classifyPartnerFxRow({ source: "api", rateTimestamp: liveTs, expiresAt: liveExp }) === "live_api",
);
assert(
  "6-hour seed API rows classify as partner_book",
  classifyPartnerFxRow({ source: "api", rateTimestamp: seedTs, expiresAt: seedExp }) === "partner_book",
);

const quotes: CorridorProviderQuote[] = [
  { partnerCode: "nomba", rate: 953.4, source: "partner_book", rateTimestamp: seedTs, expiresAt: seedExp },
  { partnerCode: "flutterwave", rate: 971.892, source: "live_api", rateTimestamp: liveTs, expiresAt: liveExp },
  { partnerCode: "fincra", rate: 968.1, source: "live_api", rateTimestamp: liveTs, expiresAt: liveExp },
];

const preferred = pickCorridorProviderBenchmark(quotes, "Nomba");
assert("seeded Nomba book is ignored even when preferred", preferred?.partnerCode === "flutterwave");

const nombaLive: CorridorProviderQuote[] = [
  ...quotes,
  { partnerCode: "nomba", rate: 970.5, source: "live_api", rateTimestamp: liveTs, expiresAt: liveExp },
];
const nombaPick = pickCorridorProviderBenchmark(nombaLive, "Nomba");
assert("preferred live Nomba wins over a better Flutterwave quote", nombaPick?.partnerCode === "nomba" && close(nombaPick.rate, 970.5));

const best = pickCorridorProviderBenchmark(quotes, null);
assert("without a preferred partner, best live quote wins", best?.partnerCode === "flutterwave" && close(best.rate, 971.892));

const treasury = resolveFxBenchmark({ providerQuotes: quotes.filter((q) => q.source === "partner_book"), treasuryMid: 972.16 });
assert("treasury mid is the fallback when no live provider quote exists", treasury.source === "treasury_mid" && close(treasury.rate, 972.16));

const composed = composeProviderCrossRate(0.73, 1330);
assert("CAD→NGN can be composed from CAD→USD × USD→NGN provider legs", close(composed ?? 0, 970.9, 0.1));

const cbnOfficial = 963.98;
const sendwave = 971.892;
const customer = customerRateFromProvider(sendwave, 0.006);
assert("provider 971.892 + 0.60% eFinMoney margin is above CBN", customer > cbnOfficial);
assert("provider + margin stays below the raw provider rate", customer < sendwave);
assert("971.892 × 0.994 ≈ 966.06", close(customer, 966.060652, 0.001));

const quoted = quoteTransfer({
  sourceCurrency: "CAD",
  destinationCurrency: "NGN",
  amount: 300,
  channel: "external",
  payoutMethod: "BANK",
  midMarketRate: sendwave,
});
assert("Send CAD→NGN bank uses provider FX as the benchmark", close(quoted.customerRate ?? 0, customer, 0.01));
assert("stacked treasury+1.5% (~952) is not used", (quoted.customerRate ?? 0) > 960);

if (process.exitCode) {
  console.error("corridor FX benchmark checks failed");
} else {
  console.log("corridor FX benchmark checks passed");
}
