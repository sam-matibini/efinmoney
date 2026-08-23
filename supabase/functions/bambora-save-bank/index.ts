/**
 * Save Canadian bank account (EFT) to Bambora payment profile.
 * Body: { holder, institutionNumber, branchNumber, accountNumber, currency? }
 */
import { bamboraGetProfile, bamboraSaveBankToProfile, getBamboraConfig } from "../_shared/bambora.ts";
import {
  bamboraCustomerCode,
  corsHeaders,
  json,
  requireUser,
} from "../_shared/bambora-auth.ts";
import { syncBamboraProfileToDb } from "../_shared/bambora-profiles-db.ts";

function passcodeAuth(merchantId: string, passcode: string): string {
  return `Passcode ${btoa(`${merchantId}:${passcode}`)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user, admin } = auth;

    const cfg = getBamboraConfig();
    if (!cfg.merchantId || !cfg.profilesPasscode) {
      return json(503, { error: "Bambora profiles not configured" });
    }

    const body = await req.json().catch(() => ({}));
    const holder = String(body.holder || body.bank_account_holder || "").trim();
    const institutionNumber = String(body.institutionNumber || body.institution_number || "").replace(/\D/g, "");
    const branchNumber = String(body.branchNumber || body.branch_number || "").replace(/\D/g, "");
    const accountNumber = String(body.accountNumber || body.account_number || "").replace(/\D/g, "");
    const currency = String(body.currency || "CAD").toUpperCase();

    if (!holder) return json(400, { error: "Account holder name required" });
    if (institutionNumber.length !== 3) return json(400, { error: "Institution number must be 3 digits" });
    if (branchNumber.length !== 5) return json(400, { error: "Transit / branch number must be 5 digits" });
    if (accountNumber.length < 5 || accountNumber.length > 12) {
      return json(400, { error: "Account number must be 5–12 digits" });
    }

    const customerCode = bamboraCustomerCode(user.id);
    const bankPayload = {
      holder,
      accountNumber,
      institutionNumber,
      branchNumber,
    };

    const existing = await bamboraGetProfile(customerCode);
    let bankRes;
    if (existing.status === 404) {
      const createRes = await fetch(`${cfg.baseUrl}/v1/profiles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: passcodeAuth(cfg.merchantId, cfg.profilesPasscode),
        },
        body: JSON.stringify({
          customer_code: customerCode,
          language: "eng",
          bank_account: {
            bank_account_holder: holder.slice(0, 64),
            account_number: accountNumber,
            bank_account_type: "Canadian",
            institution_number: institutionNumber,
            branch_number: branchNumber,
          },
        }),
      });
      const raw = await createRes.text();
      let createJson: Record<string, unknown> = {};
      try { createJson = raw ? JSON.parse(raw) : {}; } catch { createJson = { raw }; }
      bankRes = { ok: createRes.ok, status: createRes.status, json: createJson, raw };
    } else {
      bankRes = await bamboraSaveBankToProfile(customerCode, bankPayload);
    }

    if (!bankRes.ok) {
      return json(400, {
        error: String(bankRes.json.message || "Could not save bank account"),
        bambora: bankRes.json,
      });
    }

    await syncBamboraProfileToDb(admin, user.id, customerCode, currency);

    const { data: method } = await admin.from("bambora_payment_methods")
      .select("*")
      .eq("user_id", user.id)
      .eq("method_type", "bank")
      .maybeSingle();

    return json(200, {
      success: true,
      customer_code: customerCode,
      bank: method,
    });
  } catch (err) {
    console.error("bambora-save-bank", err);
    return json(500, { error: err instanceof Error ? err.message : "Save failed" });
  }
});
