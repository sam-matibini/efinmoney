import {
  isNombaEmailBlockedError,
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
assert("payer email is unique", payer.startsWith("nomba.") && payer.endsWith("@efin.money"));

const merchant = resolveNombaCustomerEmail("sam@efintax.biz", uid);
assert("substitutes efintax.biz merchant mailbox", merchant.substituted && merchant.email === payer);

const support = resolveNombaCustomerEmail("support@efin.money", uid);
assert("substitutes role mailbox", support.substituted && support.email === payer);

const extra = resolveNombaCustomerEmail("alice@gmail.com", uid, ["alice@gmail.com"]);
assert("substitutes extra blocked list", extra.substituted && extra.email === payer);

const ok = resolveNombaCustomerEmail("jane.customer@gmail.com", uid);
assert("keeps a real customer email", !ok.substituted && ok.email === "jane.customer@gmail.com");

const interacBlocked = resolveNombaCustomerEmail("autodeposit@gmail.com", uid, ["autodeposit@gmail.com"]);
assert("does not use Interac mailbox as Nomba customerEmail", interacBlocked.substituted && interacBlocked.email === payer);

const missing = resolveNombaCustomerEmail("", uid);
assert("mints email when missing", missing.substituted && missing.email === payer);

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
