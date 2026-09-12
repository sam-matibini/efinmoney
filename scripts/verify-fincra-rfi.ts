import {
  classifyFincraRfi,
  draftFincraRfiAnswer,
  extractEfmPaymentCode,
} from "../src/lib/fincraRfiAnswers.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert("classify source", classifyFincraRfi("Source of the funds") === "source");
assert("classify purpose", classifyFincraRfi("Purpose of funds") === "purpose");
assert("classify frequency", classifyFincraRfi("Confirm transaction frequency: One off or Recurring?") === "frequency");
assert("classify relationship", classifyFincraRfi("Relationship with the sender") === "relationship");
assert("classify evidence", classifyFincraRfi("Evidence of relationship (contractual agreement, etc)") === "evidence");

const source = draftFincraRfiAnswer("Source of the funds", {
  senderName: "eFintax Advisors Ltd",
  paymentCode: "EFM-20260912-00000032",
  interacReference: "CAbcaC7J",
  amountCad: 2.3,
});
assert("source names Autodeposit", /Interac e-Transfer Autodeposit/i.test(source.text));
assert("source includes payment code", source.text.includes("EFM-20260912-00000032"));

const freq = draftFincraRfiAnswer("Confirm transaction frequency: One off or Recurring?");
assert("frequency is one-off", /one-off/i.test(freq.text));

const evidence = draftFincraRfiAnswer("Evidence of relationship (contractual agreement, etc)");
assert("evidence has terms url", Boolean(evidence.urls?.some((u) => u.includes("/terms"))));

assert("extract EFM code from message", extractEfmPaymentCode("Message: EFM-20260912-00000032") === "EFM-20260912-00000032");
assert("extract efm-cad merchant ref", extractEfmPaymentCode("efm-cad-1787608884986") === "EFM-CAD-1787608884986");

if (process.exitCode) {
  console.error("fincra RFI answer checks failed");
  process.exit(1);
}
console.log("fincra RFI answer checks passed");
