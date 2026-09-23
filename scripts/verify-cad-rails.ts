import {
  CANADA_CAD_PAYOUT_RAILS,
  classifyNombaPayout,
  defaultPayoutRails,
  isCanadaCadPayout,
  resolvePayoutNetwork,
  sanitizeCanadaPayoutRails,
  availableCanadaCadPayoutRails,
} from "../supabase/functions/_shared/nomba-payout-corridors.ts";
import {
  canResumeExecuteTransfer,
  isStuckCanadaCadTransfer,
} from "../supabase/functions/_shared/executeTransferResume.ts";
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
assert("CAD default rails start with Fincra", cadRails[0] === "fincra");
assert("CAD default rails include Nomba", cadRails.includes("nomba"));
assert("CAD default rails are Fincra then Nomba", cadRails.join(",") === "fincra,nomba");
assert("CAD default rails exclude flutterwave", !cadRails.includes("flutterwave"));
assert("CAD default rails exclude flovide", !cadRails.includes("flovide"));
assert("CAD default rails exclude paysafe", !cadRails.includes("paysafe"));
assert("CAD default rails exclude Wise", !cadRails.includes("wise"));
assert("CAD default rails exclude Dodo", !cadRails.includes("dodo"));
assert(
  "CAD default rails are Canada chain",
  CANADA_CAD_PAYOUT_RAILS.every((r) => cadRails.includes(r)),
);

const cleaned = sanitizeCanadaPayoutRails(["flutterwave", "fincra", "nomba", "flovide", "paysafe", "wise", "dodo"]);
assert("sanitize drops flutterwave", !cleaned.includes("flutterwave"));
assert("sanitize keeps Fincra payout", cleaned.includes("fincra"));
assert("sanitize keeps nomba", cleaned.includes("nomba"));
assert("sanitize puts Fincra first", cleaned[0] === "fincra");
assert("sanitize drops flovide", !cleaned.includes("flovide"));
assert("sanitize drops paysafe", !cleaned.includes("paysafe"));
assert("sanitize drops Wise", !cleaned.includes("wise"));
assert("sanitize drops Dodo", !cleaned.includes("dodo"));

assert("CAD currency maps to Canada", findCountryByCode("CAD")?.id === "Canada");
assert("CA ISO2 maps to Canada", findCountryByCode("CA")?.id === "Canada");
assert("CANADA word maps to Canada", findCountryByCode("Canada")?.id === "Canada");
assert("isCanadaCountryCode CAD", isCanadaCountryCode("CAD"));
assert("isCanadaCountryCode CA", isCanadaCountryCode("ca"));
assert("NGN is not Canada country code", !isCanadaCountryCode("NGN"));

assert("resume initiated", canResumeExecuteTransfer("initiated"));
assert("resume funded", canResumeExecuteTransfer("funded"));
assert("resume pending_ops", canResumeExecuteTransfer("pending_ops"));
assert("resume pending_liquidity", canResumeExecuteTransfer("pending_liquidity"));
assert("resume processing without provider ref", canResumeExecuteTransfer("processing", null));
assert("block processing with provider ref", !canResumeExecuteTransfer("processing", "PAY-1"));
assert("block completed", !canResumeExecuteTransfer("completed"));
assert("block failed", !canResumeExecuteTransfer("failed"));
assert("block reversed", !canResumeExecuteTransfer("reversed"));

assert(
  "stuck funded CAD is retryable",
  isStuckCanadaCadTransfer({
    status: "funded",
    target_currency: "CAD",
    source_currency: "CAD",
    recipient_country: "CA",
    payout_method: "interac",
    transfer_type: "domestic_canada",
  }),
);
assert(
  "stuck pending_ops CAD is retryable",
  isStuckCanadaCadTransfer({
    status: "pending_ops",
    target_currency: "CAD",
    source_currency: "CAD",
    recipient_country: "CAD",
    payout_method: "interac",
    transfer_type: "domestic_canada",
  }),
);
assert(
  "initiated CAD is not stuck yet",
  !isStuckCanadaCadTransfer({
    status: "initiated",
    target_currency: "CAD",
    source_currency: "CAD",
    recipient_country: "CA",
    payout_method: "interac",
    transfer_type: "domestic_canada",
  }),
);
assert(
  "KES funded is not Canada stuck",
  !isStuckCanadaCadTransfer({
    status: "funded",
    target_currency: "KES",
    source_currency: "CAD",
    recipient_country: "KE",
    payout_method: "mpesa",
  }),
);

assert(
  "CAD available rails skip Nomba when unconfigured",
  availableCanadaCadPayoutRails({ nombaConfigured: false, fincraConfigured: true }).join(",") === "fincra",
);
assert(
  "CAD available rails skip Fincra when unconfigured",
  availableCanadaCadPayoutRails({ nombaConfigured: true, fincraConfigured: false }).join(",") === "nomba",
);
assert(
  "CAD available rails drop Flutterwave and put Fincra first",
  availableCanadaCadPayoutRails({
    nombaConfigured: true,
    fincraConfigured: true,
    policyRails: ["flutterwave", "nomba", "fincra"],
  }).join(",") === "fincra,nomba",
);
assert(
  "CAD available empty when neither rail is live",
  availableCanadaCadPayoutRails({ nombaConfigured: false, fincraConfigured: false }).length === 0,
);

if (process.exitCode) {
  console.error("CAD rail checks failed");
  process.exit(1);
}
console.log("CAD rail checks passed");
