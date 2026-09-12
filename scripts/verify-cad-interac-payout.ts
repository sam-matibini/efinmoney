import {
  CAD_INTERAC_MISSING_CONTACT,
  isCadInteracPayout,
  isCadInteracPayoutMethod,
  isCanadaPayoutCountry,
  parseCaMobile,
  parseInteracEmail,
  requireCadInteracDestination,
  resolveCadInteracDestination,
} from "../src/lib/cadInteracPayout.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert("parse email", parseInteracEmail("Jane@Example.COM") === "jane@example.com");
assert("reject bad email", parseInteracEmail("not-an-email") === null);
assert("parse 10-digit mobile", parseCaMobile("(416) 555-0123") === "+14165550123");
assert("parse +1 mobile", parseCaMobile("+1 416 555 0123") === "+14165550123");
assert("reject short mobile", parseCaMobile("5550123") === null);

const emailOnly = resolveCadInteracDestination({ recipient_account: "petronella@example.com" });
assert("email-only ok", emailOnly.ok && emailOnly.ok && emailOnly.dest.consumerIdType === "EMAIL");

const phoneOnly = resolveCadInteracDestination({ recipient_phone: "4165550123" });
assert(
  "phone-only ok",
  phoneOnly.ok && phoneOnly.dest.consumerIdType === "PHONE" && phoneOnly.dest.consumerId === "4165550123",
);

const both = resolveCadInteracDestination({
  recipient_email: "a@b.ca",
  recipient_phone: "4165550123",
});
assert("email preferred when both set", both.ok && both.dest.consumerIdType === "EMAIL");

const missing = resolveCadInteracDestination({});
assert("both missing fails", !missing.ok && missing.error === CAD_INTERAC_MISSING_CONTACT);

assert(
  "CAD Interac payout detected",
  isCadInteracPayout({ payout_method: "interac", target_currency: "CAD", recipient_country: "CA" }),
);
assert(
  "EFT is not Interac payout",
  !isCadInteracPayout({ payout_method: "eft", target_currency: "CAD", recipient_country: "CA" }),
);

const skip = requireCadInteracDestination({
  payout_method: "eft",
  target_currency: "CAD",
  recipient_country: "CA",
});
assert("EFT collection not gated", skip.required === false);

const blocked = requireCadInteracDestination({
  payout_method: "interac",
  target_currency: "CAD",
  recipient_country: "CA",
  recipient_account: "",
  recipient_phone: "",
});
assert("missing contact blocks collection", blocked.required && !blocked.ok);

const allowed = requireCadInteracDestination({
  payout_method: "interac",
  target_currency: "CAD",
  recipient_country: "CA",
  recipient_phone: "4165550199",
});
assert("phone-only collection allowed", allowed.required && allowed.ok && allowed.dest.consumerIdType === "PHONE");

assert("CA is Canada payout country", isCanadaPayoutCountry("CA"));
assert("CAD is Canada payout country", isCanadaPayoutCountry("CAD"));
assert("Canada word is payout country", isCanadaPayoutCountry("Canada"));
assert("KE is not Canada payout country", !isCanadaPayoutCountry("KE"));
assert("interac method match", isCadInteracPayoutMethod("interac"));
assert("interac substring match", isCadInteracPayoutMethod("canada_interac"));
assert("eft is not interac method", !isCadInteracPayoutMethod("eft"));

const allowedLogin = resolveCadInteracDestination({
  recipient_email: "jane@gmail.com",
  blocked_emails: ["jane@gmail.com"],
});
assert("profile login email is a valid Interac dest", allowedLogin.ok && allowedLogin.ok && allowedLogin.dest.email === "jane@gmail.com");

const businessEmail = resolveCadInteracDestination({
  recipient_email: "ap@acme.com",
});
assert("business Interac email is allowed", businessEmail.ok && businessEmail.ok && businessEmail.dest.email === "ap@acme.com");

const platformLogin = resolveCadInteracDestination({
  recipient_email: "sam@efin.money",
});
assert("efin.money profile email is allowed as Interac dest", platformLogin.ok && platformLogin.ok && platformLogin.dest.email === "sam@efin.money");

const prefersInteracCol = resolveCadInteracDestination({
  interac_email: "autodeposit@gmail.com",
  recipient_email: "sam@efin.money",
});
assert(
  "prefers dedicated Interac email column when both are set",
  prefersInteracCol.ok && prefersInteracCol.ok && prefersInteracCol.dest.email === "autodeposit@gmail.com",
);

if (process.exitCode) {
  console.error("cad Interac payout checks failed");
  process.exit(1);
}
console.log("cad Interac payout checks passed");
