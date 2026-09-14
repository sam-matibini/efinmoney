import {
  bpsDelta,
  corePairs,
  invertRate,
  liquidityAwareBenchmark,
  parseBocSeriesCode,
  parseBocValetJson,
  parseEcbEurofxrefXml,
  publishEfrrBook,
  resolveEfrrPair,
  usdBookFromOxr,
  indexObservations,
} from "../src/lib/efrr/engine.ts";
import { customerRateFromProvider } from "../src/lib/fxCorridorBenchmark.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const close = (a: number, b: number, eps = 0.0001) => Math.abs(a - b) <= eps;

assert("FXUSDCAD parses as USD/CAD", parseBocSeriesCode("FXUSDCAD")?.base === "USD" && parseBocSeriesCode("FXUSDCAD")?.quote === "CAD");
assert("invert 1.3866 USD/CAD", close(invertRate(1.3866) ?? 0, 1 / 1.3866));

const bocJson = {
  observations: [
    {
      d: "2026-09-11",
      FXUSDCAD: { v: "1.3866" },
      FXEURCAD: { v: "1.6200" },
      FXGBPCAD: { v: "1.8100" },
      FXZARCAD: { v: "0.0795" },
    },
  ],
};
const boc = parseBocValetJson(bocJson, "2026-09-13T14:32:11.000Z");
assert("BoC Valet emits USD/CAD 1.3866", boc.some((r) => r.baseCurrency === "USD" && r.quoteCurrency === "CAD" && close(r.rate, 1.3866)));
assert("BoC is the primary source tag", boc.every((r) => r.source === "bank_of_canada"));

const oxr = usdBookFromOxr({
  timestamp: 1757760000,
  rates: { CAD: 1.3866, NGN: 1348.2, KES: 129.4, UGX: 3600, ZMW: 23.1, EUR: 0.92, GBP: 0.766 },
}, "open_exchange_rates");

const ecbXml = `<?xml version="1.0"?>
<gesmes:Envelope>
  <Cube>
    <Cube time="2026-09-11">
      <Cube currency="USD" rate="1.0850"/>
      <Cube currency="CAD" rate="1.5045"/>
      <Cube currency="GBP" rate="0.8450"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;
const ecb = parseEcbEurofxrefXml(ecbXml);

const bocMap = indexObservations(boc);
const ecbMap = indexObservations(ecb);

const usdCad = resolveEfrrPair("USD", "CAD", bocMap, oxr, ecbMap);
assert("USD→CAD EFRR uses Bank of Canada", usdCad.primarySource === "bank_of_canada" && close(usdCad.referenceRate, 1.3866));
assert("USD→CAD keeps an OXR fallback", usdCad.fallbackSource === "open_exchange_rates" && close(usdCad.fallbackRate ?? 0, 1.3866));
assert("USD→CAD is ECB-validated", usdCad.validationSource === "ecb" && usdCad.validationRate != null);

const cadNgn = resolveEfrrPair("CAD", "NGN", bocMap, oxr, ecbMap);
assert("CAD→NGN hybrid uses BoC USD/CAD × OXR NGN", cadNgn.primarySource.includes("bank_of_canada") && cadNgn.referenceRate > 0);
assert("CAD→NGN hybrid ≈ 1348.2 / 1.3866", close(cadNgn.referenceRate, 1348.2 / 1.3866, 0.05));

const kesUgx = resolveEfrrPair("KES", "UGX", bocMap, oxr, ecbMap);
assert("Africa-Africa pair falls back to OXR", kesUgx.primarySource === "open_exchange_rates" && kesUgx.referenceRate > 0);

const book = publishEfrrBook([["USD", "CAD"], ["CAD", "NGN"], ["CAD", "KES"]], boc, oxr, ecb);
assert("publisher emits the requested pairs", book.length === 3);

const efrr = 972.16;
const execution = 960.0;
assert("Africa liquidity uses partner execution, not EFRR", liquidityAwareBenchmark(efrr, execution) === 960);
assert("without a partner quote, EFRR is the benchmark", liquidityAwareBenchmark(efrr, null) === 972.16);

const spread = 0.006;
const customer = customerRateFromProvider(liquidityAwareBenchmark(efrr, execution)!, spread);
assert("customer rate = execution × (1 − EX spread)", close(customer, 960 * 0.994, 0.001));
assert("customer is worse than EFRR because NGN liquidity is below the published mid", customer < customerRateFromProvider(efrr, spread));

const exampleCustomer = 1.3866 + 0.0150;
assert("USD/CAD example spread can be applied as an absolute add-on", close(exampleCustomer, 1.4016));
assert("bps helper", bpsDelta(100, 99) === 100);

const allCore = corePairs(["USD", "CAD", "NGN"]);
assert("core pairs exclude identities", allCore.length === 6 && !allCore.some(([a, b]) => a === b));

if (process.exitCode) {
  console.error("EFRR checks failed");
} else {
  console.log("EFRR checks passed");
}
