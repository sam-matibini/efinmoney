import {
  defaultPayoutRails,
  fincraPayoutSupported,
  nombaPayoutSupported,
  sanitizeCanadaPayoutRails,
} from "../supabase/functions/_shared/nomba-payout-corridors.ts";
import {
  orderRailsByLeastCost,
  rankByStrategy,
  type ScoredCandidate,
} from "../supabase/functions/_shared/routingEngine.ts";
import { isLiveSendCountryId } from "../src/lib/countries.ts";
import { isLivePayoutCurrency } from "../src/lib/retailPayoutFees.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert("Uganda is a live send country", isLiveSendCountryId("Uganda"));
assert("Tanzania is live", isLiveSendCountryId("Tanzania"));
assert("Rwanda is live", isLiveSendCountryId("Rwanda"));
assert("Ivory Coast is live", isLiveSendCountryId("Ivory Coast"));
assert("UAE is live", isLiveSendCountryId("UAE"));
assert("Mozambique stays coming soon", !isLiveSendCountryId("Mozambique"));

assert("UGX is a live payout currency", isLivePayoutCurrency("UGX"));
assert("UG maps to live payout", isLivePayoutCurrency("UG"));
assert("UGANDA name is live", isLivePayoutCurrency("UGANDA"));
assert("XOF is live", isLivePayoutCurrency("XOF"));
assert("MWK is not a Nomba/Fincra payout", !isLivePayoutCurrency("MWK"));

assert("Nomba pays UGX", nombaPayoutSupported({ currency: "UGX", country: "UG", method: "mtn_mobile" }));
assert("Fincra pays UGX", fincraPayoutSupported("UGX", "UG"));
assert("Fincra does not pay CAD", !fincraPayoutSupported("CAD", "CA"));
assert("Nomba pays CAD Interac", nombaPayoutSupported({ currency: "CAD", country: "CA", method: "interac" }));

const ugRails = defaultPayoutRails({ currency: "UGX", country: "UG", method: "mtn_mobile" });
assert("UGX rails include Nomba", ugRails.includes("nomba"));
assert("UGX rails include Fincra", ugRails.includes("fincra"));

const cad = sanitizeCanadaPayoutRails(["nomba", "fincra", "flutterwave"]);
assert("CAD sanitize keeps Nomba only", cad.length === 1 && cad[0] === "nomba");

const cheapFincra = orderRailsByLeastCost(
  ["nomba", "fincra", "flutterwave"],
  [
    { partner_code: "nomba", total_cost: 4.2 },
    { partner_code: "fincra", total_cost: 2.1 },
  ],
);
assert("least cost puts Fincra first", cheapFincra[0] === "fincra" && cheapFincra[1] === "nomba");
assert("unknown rails stay last", cheapFincra[2] === "flutterwave");

const ranked = rankByStrategy(
  [
    { partner_code: "nomba", total_cost: 5, expected_profit: 1, score: 0.9, success_rate: 99, reliability_score: 96, priority: 10 } as ScoredCandidate,
    { partner_code: "fincra", total_cost: 3, expected_profit: 0.5, score: 0.4, success_rate: 93, reliability_score: 93, priority: 40 } as ScoredCandidate,
  ],
  "lowest_cost",
);
assert("rankByStrategy lowest_cost", ranked[0].partner_code === "fincra");

if (process.exitCode) {
  console.error("Nomba/Fincra corridor checks failed");
  process.exit(1);
}
console.log("Nomba/Fincra corridor checks passed");
