import { buildKycStages, kycTierNumber, remainingKycStages, skipBusinessKycRedirect } from "../src/lib/kycStages.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert("tier_2 parses to 2", kycTierNumber("tier_2") === 2);
assert("missing tier is 0", kycTierNumber(null) === 0);

const tier2 = buildKycStages(2, {
  verification_status: "approved",
  id_verification_status: "approved",
  liveness_check_status: "approved",
});
const tier2Left = remainingKycStages(tier2);
assert(
  "tier 2 keeps identity and selfie complete",
  tier2.find((stage) => stage.id === "identity")?.status === "complete" &&
    tier2.find((stage) => stage.id === "selfie")?.status === "complete",
);
assert(
  "tier 2 remaining stages are the tier 3 forms",
  tier2Left.map((stage) => stage.id).join(",") === "address,source",
);
assert(
  "tier 3 stages stay on personal KYC for a business account",
  tier2Left.every((stage) => stage.href?.includes("upgrade=1")),
);
assert(
  "address stage opens the enhanced form",
  tier2Left[0]?.href === "/onboarding/enhanced?upgrade=1&stage=address",
);
assert(
  "source stage opens the enhanced form",
  tier2Left[1]?.href === "/onboarding/enhanced?upgrade=1&stage=source",
);

const tier1 = buildKycStages(1, { verification_status: "not_started" });
assert(
  "tier 1 can open identity and selfie",
  tier1.filter((stage) => stage.status === "available").map((stage) => stage.id).join(",") === "identity,selfie",
);
assert(
  "tier 3 stays locked until tier 2",
  tier1.filter((stage) => stage.id === "address" || stage.id === "source").every((stage) => stage.status === "locked" && stage.href === null),
);

const pending = buildKycStages(2, {
  verification_status: "pending_review",
  tier_target: "tier_3",
  address_document_url: "docs/address.pdf",
  source_of_funds_url: "docs/source.pdf",
});
assert(
  "uploaded tier 3 documents are in review",
  pending.find((stage) => stage.id === "address")?.status === "pending" &&
    pending.find((stage) => stage.id === "source")?.status === "pending",
);

const done = remainingKycStages(buildKycStages(3, { verification_status: "approved" }));
assert("tier 3 has no remaining stages", done.length === 0);
assert("upgrade=1 keeps a business user on personal KYC", skipBusinessKycRedirect("1"));
assert("a business user without upgrade is not kept on personal KYC", !skipBusinessKycRedirect(null));

if (process.exitCode) {
  console.error("kyc stage checks failed");
} else {
  console.log("kyc stage checks passed");
}
