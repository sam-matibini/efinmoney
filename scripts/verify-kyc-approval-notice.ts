import { kycApprovalToast, pickAccountEmail } from "../src/lib/kycApprovalNotice.ts";

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
