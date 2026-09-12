import {
  CANADA_CAD_PAYOUT_RAILS,
  classifyNombaPayout,
  defaultPayoutRails,
  isCanadaCadPayout,
  resolvePayoutNetwork,
  sanitizeCanadaPayoutRails,
} from "../supabase/functions/_shared/nomba-payout-corridors.ts";
import { findCountryByCode, isCanadaCountryCode } from "../src/lib/countries.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert(
  "CAD+blank is Canada corridor",
  isCanadaCadPayout({ currency: "CAD", country: "CA", transferType: "domestic_canada" }),
);
assert(
  "CAD dest is Canada even without country",
  isCanadaCadPayout({ currency: "CAD", method: "mpesa" }),
);
assert(
  "KES is not Canada",
  !isCanadaCadPayout({ currency: "KES", country: "KE", method: "mpesa" }),
);

assert("CAD blank network is interac", resolvePayoutNetwork(null, "CAD") === "interac");
assert("CAD mpesa network is interac", resolvePayoutNetwork("mpesa", "CAD") === "interac");
assert("CAD mobile_money network is interac", resolvePayoutNetwork("mobile_money", "CAD") === "interac");
assert("CAD eft network is eft", resolvePayoutNetwork("eft", "CAD") === "eft");
assert("KES still defaults to mpesa", resolvePayoutNetwork(null, "KES") === "mpesa");

assert(
  "CAD+mpesa classifies as Interac, not MoMo",
  classifyNombaPayout({ currency: "CAD", country: "CA", method: "mpesa" }) === "global_interac",
);
assert(
  "CAD+interac is Interac",
  classifyNombaPayout({ currency: "CAD", country: "CA", method: "interac" }) === "global_interac",
);
assert(
  "CAD+eft is bank/EFT",
  classifyNombaPayout({ currency: "CAD", country: "CA", method: "eft" }) === "global_bank",
);
assert(
  "CAD+blank is Interac",
  classifyNombaPayout({ currency: "CAD", country: "CA" }) === "global_interac",
);

const cadRails = defaultPayoutRails({ currency: "CAD", country: "CA", method: "interac" });
assert("CAD default rails start with nomba", cadRails[0] === "nomba");
assert("CAD default rails exclude flutterwave", !cadRails.includes("flutterwave"));
assert("CAD default rails exclude fincra", !cadRails.includes("fincra"));
assert(
  "CAD default rails are Canada chain",
  CANADA_CAD_PAYOUT_RAILS.every((r) => cadRails.includes(r)),
);

const cleaned = sanitizeCanadaPayoutRails(["flutterwave", "fincra", "nomba"]);
assert("sanitize drops flutterwave", !cleaned.includes("flutterwave"));
assert("sanitize drops fincra", !cleaned.includes("fincra"));
assert("sanitize keeps nomba", cleaned.includes("nomba"));
assert("sanitize adds paysafe", cleaned.includes("paysafe"));

assert("CAD currency maps to Canada", findCountryByCode("CAD")?.id === "Canada");
assert("CA ISO2 maps to Canada", findCountryByCode("CA")?.id === "Canada");
assert("CANADA word maps to Canada", findCountryByCode("Canada")?.id === "Canada");
assert("isCanadaCountryCode CAD", isCanadaCountryCode("CAD"));
assert("isCanadaCountryCode CA", isCanadaCountryCode("ca"));
assert("NGN is not Canada country code", !isCanadaCountryCode("NGN"));

if (process.exitCode) {
  console.error("CAD rail checks failed");
  process.exit(1);
}
console.log("CAD rail checks passed");
