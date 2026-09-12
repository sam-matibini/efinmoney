import {
  isNombaEmailBlockedError,
  nombaCheckoutEmailCandidates,
  nombaPayerEmail,
  resolveNombaCustomerEmail,
} from "../supabase/functions/_shared/nomba-customer-email.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const uid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const payer = nombaPayerEmail(uid);
assert("payer email is unique", payer.startsWith("payer.") && payer.endsWith("@efinsuite.com"));
assert("payer email is not efin.money", !payer.endsWith("@efin.money"));

const merchant = resolveNombaCustomerEmail("sam@efintax.biz", uid);
assert("substitutes efintax.biz merchant mailbox", merchant.substituted && merchant.email === payer);

const efinLogin = resolveNombaCustomerEmail("jane@efin.money", uid);
assert("substitutes efin.money login", efinLogin.substituted && efinLogin.email === payer);

const oldSynthetic = resolveNombaCustomerEmail("nomba.aaaaaaaabbbbccccdd@efin.money", uid);
assert("substitutes old nomba.@efin.money synthetic", oldSynthetic.substituted && oldSynthetic.email === payer);

const support = resolveNombaCustomerEmail("support@efin.money", uid);
assert("substitutes role mailbox", support.substituted && support.email === payer);

const extra = resolveNombaCustomerEmail("alice@gmail.com", uid, ["alice@gmail.com"]);
assert("substitutes extra blocked list", extra.substituted && extra.email === payer);

const ok = resolveNombaCustomerEmail("jane.customer@gmail.com", uid);
assert("keeps a real customer email", !ok.substituted && ok.email === "jane.customer@gmail.com");

const yahoo = resolveNombaCustomerEmail("pmcckees@yahoo.com", uid);
assert("keeps a personal yahoo mailbox", !yahoo.substituted && yahoo.email === "pmcckees@yahoo.com");

const interacBlocked = resolveNombaCustomerEmail("autodeposit@gmail.com", uid, ["autodeposit@gmail.com"]);
assert("does not use Interac mailbox as Nomba customerEmail", interacBlocked.substituted && interacBlocked.email === payer);

const missing = resolveNombaCustomerEmail("", uid);
assert("mints email when missing", missing.substituted && missing.email === payer);

const cadCandidates = nombaCheckoutEmailCandidates(
  "pmcckees@yahoo.com",
  uid,
  ["pmcckees@yahoo.com"],
);
assert(
  "CAD Interac extra-block still yields a non-efin fallback",
  cadCandidates[0] === payer && cadCandidates.every((e) => !e.endsWith("@efin.money")),
);

const keepCandidates = nombaCheckoutEmailCandidates("jane.customer@gmail.com", uid, ["autodeposit@gmail.com"]);
assert("candidates start with the real mailbox", keepCandidates[0] === "jane.customer@gmail.com");
assert("candidates include payer fallback", keepCandidates.includes(payer));

assert(
  "detects Nomba blocked-email error",
  isNombaEmailBlockedError("Invalid input: The provided email is blocked."),
);
assert("ignores unrelated Nomba errors", !isNombaEmailBlockedError("Invalid Currency"));

if (process.exitCode) {
  console.error("Nomba customer-email checks failed");
  process.exit(1);
}
console.log("Nomba customer-email checks passed");
