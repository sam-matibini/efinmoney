import {
  classifyNombaPayout,
  nombaBankPaymentMethod,
} from "../supabase/functions/_shared/nomba-payout-corridors.ts";
import {
  bankTransferMethodsFor,
  canPayoutBank,
  defaultBankTransferMethod,
  payoutSpecFor,
  type LinkedBank,
} from "../src/lib/linkedBank.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

function bank(partial: Partial<LinkedBank> & Pick<LinkedBank, "country" | "currency">): LinkedBank {
  return {
    id: partial.id || "bank-1",
    source: partial.source || "saved",
    currency: partial.currency,
    country: partial.country,
    institution: partial.institution || "Test Bank",
    lastFour: partial.lastFour || "9999",
    displayName: partial.displayName || "Test Bank ····9999",
    accountName: partial.accountName || "Acme Ltd",
    details: partial.details || {},
  };
}

const ca = bank({
  country: "CA",
  currency: "CAD",
  details: {
    bank_name: "RBC",
    institution_number: "003",
    transit_number: "12345",
    account_number: "9876543",
  },
});

const us = bank({
  country: "US",
  currency: "USD",
  details: {
    bank_name: "Chase",
    routing_number: "021000021",
    account_number: "123456789",
  },
});

const ng = bank({
  country: "NG",
  currency: "NGN",
  details: {
    bank_name: "GTBank",
    bank_code: "058",
    account_number: "0123456789",
  },
});

assert("CA methods include EFT, Interac, wire", (() => {
  const ids = bankTransferMethodsFor("CA").map((m) => m.id);
  return ids.includes("eft") && ids.includes("interac") && ids.includes("wire");
})());
assert("US methods are ACH then wire", (() => {
  const ids = bankTransferMethodsFor("US").map((m) => m.id);
  return ids[0] === "ach" && ids[1] === "wire";
})());
assert("GB methods are Faster Payments then wire", (() => {
  const ids = bankTransferMethodsFor("GB").map((m) => m.id);
  return ids[0] === "bank" && ids[1] === "wire";
})());
assert("NG method is local bank", bankTransferMethodsFor("NG")[0]?.id === "bank");

assert("CA default is EFT", defaultBankTransferMethod(ca) === "eft");
assert("US default is ACH", defaultBankTransferMethod(us) === "ach");

const caEft = payoutSpecFor(ca, "eft");
assert("CA EFT can payout", caEft.canPayout && caEft.payoutMethod === "eft");
assert("CA EFT account is inst-transit-acct", caEft.recipientAccount === "003-12345-9876543");

const caWire = payoutSpecFor(ca, "wire");
assert("CA wire can payout", caWire.canPayout && caWire.payoutMethod === "wire");
assert("CA wire keeps EFT routing payload", caWire.recipientAccount === "003-12345-9876543");

const caInteracMissing = payoutSpecFor(ca, "interac");
assert("CA Interac without contact is blocked", !caInteracMissing.canPayout);

const caInterac = payoutSpecFor(
  bank({
    ...ca,
    details: { ...ca.details, interac_email: "ap@acme.com" },
  }),
  "interac",
);
assert("CA Interac with business email can payout", caInterac.canPayout && caInterac.payoutMethod === "interac");
assert("CA Interac destination is email", caInterac.recipientAccount === "ap@acme.com");

assert("profile login email can be Interac dest", payoutSpecFor(
  bank({ ...ca, details: { ...ca.details, interac_email: "user@efin.money" } }),
  "interac",
).canPayout);

const usAch = payoutSpecFor(us, "ach");
assert("US ACH can payout", usAch.canPayout && usAch.payoutMethod === "ach");
const usWire = payoutSpecFor(us, "wire");
assert("US wire can payout", usWire.canPayout && usWire.payoutMethod === "wire");
assert("US wire uses ABA routing", usWire.recipientBankCode === "021000021");

assert("NG NUBAN can payout", payoutSpecFor(ng).canPayout && payoutSpecFor(ng).payoutMethod === "bank");
assert("canPayoutBank CA", canPayoutBank(ca));
assert("canPayoutBank US", canPayoutBank(us));

assert("Nomba CAD EFT maps to EFT", nombaBankPaymentMethod("CAD", "CA", "eft") === "EFT");
assert("Nomba CAD Interac maps to INTERAC", nombaBankPaymentMethod("CAD", "CA", "interac") === "INTERAC");
assert("Nomba CAD wire maps to WIRE", nombaBankPaymentMethod("CAD", "CA", "wire") === "WIRE");
assert("Nomba CAD blank defaults to EFT", nombaBankPaymentMethod("CAD", "CA") === "EFT");
assert("Nomba USD ACH maps to ACH", nombaBankPaymentMethod("USD", "US", "ach") === "ACH");
assert("Nomba USD wire maps to WIRE", nombaBankPaymentMethod("USD", "US", "wire") === "WIRE");
assert("Nomba USD blank defaults to ACH", nombaBankPaymentMethod("USD", "US") === "ACH");
assert("Nomba GBP bank is Faster Payments", nombaBankPaymentMethod("GBP", "GB", "bank") === "FASTER_PAYMENTS");
assert("Nomba GBP wire maps to WIRE", nombaBankPaymentMethod("GBP", "GB", "wire") === "WIRE");
assert("Nomba EUR SEPA", nombaBankPaymentMethod("EUR", "DE", "bank") === "SEPA");
assert("Nomba EUR wire maps to WIRE", nombaBankPaymentMethod("EUR", "DE", "wire") === "WIRE");

assert("classify CAD wire is bank", classifyNombaPayout({ currency: "CAD", country: "CA", method: "wire" }) === "global_bank");
assert("classify CAD EFT is bank", classifyNombaPayout({ currency: "CAD", country: "CA", method: "eft" }) === "global_bank");
assert("classify CAD Interac is Interac", classifyNombaPayout({ currency: "CAD", country: "CA", method: "interac" }) === "global_interac");
assert("classify USD ACH is bank", classifyNombaPayout({ currency: "USD", country: "US", method: "ach" }) === "global_bank");
assert("classify USD wire is bank", classifyNombaPayout({ currency: "USD", country: "US", method: "wire" }) === "global_bank");

if (process.exitCode) {
  console.error("B2B bank-to-bank rail checks failed");
  process.exit(1);
}
console.log("B2B bank-to-bank rail checks passed");
