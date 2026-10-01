import { kycApprovalToast, pickAccountEmail } from "../src/lib/kycApprovalNotice.ts";
import { kycApprovalOptionDetail as uiDetail, limitsFromTierRow as uiLimits } from "../src/lib/kycLimitCopy.ts";
import {
  kycApprovalOptionDetail,
  kycApprovedInnerHtml,
  kycSendLimitPhrase,
  limitsFromEmailData,
  limitsFromTierRow,
  SEEDED_KYC_LIMITS,
} from "../supabase/functions/_shared/kycLimitCopy.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert("profile email wins over a blank auth email", pickAccountEmail("  ", "user@efin.money") === "user@efin.money");
assert("blank candidates return null", pickAccountEmail(null, "  ") === null);

const sent = kycApprovalToast({ email_sent: true, email: "sam@efin.money" });
assert("sent toast names the recipient", sent.level === "success" && sent.message === "Verification approved — notification email sent to sam@efin.money");

const fallback = kycApprovalToast({ email_sent: true }, { fallbackEmail: "fallback@efin.money" });
assert("sent toast can use the profile email", fallback.message.endsWith("fallback@efin.money"));

const failed = kycApprovalToast(
  { email_sent: false, email_error: "No email address on the user account" },
  { overridden: true },
);
assert(
  "failed send keeps the approval and explains why",
  failed.level === "error" &&
    failed.message === "Decision overridden — approved, but the notification email was not sent. No email address on the user account",
);

const legacy = kycApprovalToast({});
assert("a response without email_sent still confirms the email was requested", legacy.level === "success" && legacy.message.includes("notification email sent"));

const tier3 = limitsFromTierRow(null, "tier_3");
const tier2 = limitsFromTierRow(null, "tier_2");
assert(
  "tier 3 email uses the enhanced schedule, not the premium tier",
  kycSendLimitPhrase(tier3) === "up to $5,000/day and $10,000/month, including international transfers and virtual cards",
);
assert(
  "tier 2 email uses the standard schedule",
  kycSendLimitPhrase(tier2) === "up to $3,000/day and $3,000/month",
);
assert(
  "a saved tier row replaces the seeded numbers",
  kycSendLimitPhrase(limitsFromTierRow({
    daily_limit: 2500,
    monthly_limit: 8000,
    features_enabled: { international: true, virtual_card: false },
  }, "tier_3")) === "up to $2,500/day and $8,000/month, including international transfers",
);
assert(
  "email data without limits falls back to the tier schedule",
  kycSendLimitPhrase(limitsFromEmailData({ scope: "id_and_address" }, "tier_3")) === kycSendLimitPhrase(SEEDED_KYC_LIMITS.tier_3),
);

const html = kycApprovedInnerHtml({ name: "Samson Matibini", tierLabel: "Tier 3", limits: tier3 });
assert("approval email names the tier 3 limits", html.includes("You can now send up to $5,000/day and $10,000/month, including international transfers and virtual cards."));
assert("approval email does not quote the premium daily limit", !html.includes("$50,000"));
assert("approval email does not quote the premium monthly limit", !html.includes("$500,000"));
assert("approval dialog and email share the tier 3 figures", uiDetail(uiLimits(null, "tier_3")) === kycApprovalOptionDetail(tier3));
assert("approval dialog and email share the tier 2 figures", uiDetail(uiLimits(null, "tier_2")) === kycApprovalOptionDetail(tier2));

if (process.exitCode) process.exit(process.exitCode);
console.log("kyc approval limit checks passed");
