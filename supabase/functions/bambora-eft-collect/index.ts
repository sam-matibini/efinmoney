/**
 * Submit EFT debit batch to collect from saved Bambora bank profile.
 * Body: { amount, walletId, currency?, useSavedBank? }
 */
import { bamboraSubmitEftDebitBatch, getBamboraConfig } from "../_shared/bambora.ts";
import {
  bamboraCustomerCode,
  corsHeaders,
  json,
  requireUser,
  validateTopupAmount,
} from "../_shared/bambora-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user, admin } = auth;

    const cfg = getBamboraConfig();
    if (!cfg.merchantId || !cfg.batchPasscode) {
      return json(503, {
        error: "Bambora EFT batch not configured",
        hint: "Set BAMBORA_BATCH_PASSCODE (Batch Upload passcode in merchant portal)",
      });
    }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    const currency = String(body.currency || "CAD").toUpperCase();
    const walletId = String(body.walletId || body.wallet_id || "").trim();

    if (currency !== "CAD") return json(400, { error: "Bambora EFT is CAD only" });
    const amtErr = validateTopupAmount(amount, currency);
    if (amtErr) return json(400, { error: amtErr });
    if (!walletId) return json(400, { error: "walletId required" });

    const { data: wallet } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return json(403, { error: "Wallet not found" });
    if (String(wallet.currency_code).toUpperCase() !== "CAD") {
      return json(400, { error: "Wallet must be CAD for EFT debit" });
    }

    const customerCode = bamboraCustomerCode(user.id);
    const { data: bank } = await admin.from("bambora_payment_methods")
      .select("id")
      .eq("user_id", user.id)
      .eq("method_type", "bank")
      .maybeSingle();
    if (!bank) {
      return json(400, { error: "Link a bank account first", code: "no_bank_profile" });
    }

    const idempotencyKey = String(body.idempotencyKey || `eft-${walletId}-${amount}-${Date.now()}`);
    const externalRef = `bambora-eft:${idempotencyKey}`;

    const { data: dup } = await admin.from("bambora_eft_collections")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (dup) {
      return json(200, { success: true, already: true, status: dup.status, id: dup.id });
    }

    const batch = await bamboraSubmitEftDebitBatch({
      customerCode,
      amount,
      descriptor: "eFinMoney CAD top-up",
      processNow: true,
    });

    const batchOk = String(batch.json.code ?? "") === "1" || batch.ok;
    if (!batchOk) {
      return json(400, {
        error: String(batch.json.message || "EFT batch submission failed"),
        bambora: batch.json,
      });
    }

    const batchId = String(batch.json.batch_id ?? batch.json.id ?? "");
    const { data: row, error: insErr } = await admin.from("bambora_eft_collections").insert({
      user_id: user.id,
      wallet_id: walletId,
      amount,
      currency_code: currency,
      customer_code: customerCode,
      batch_id: batchId || null,
      batch_message: String(batch.json.message || ""),
      status: "submitted",
      external_reference: externalRef,
      idempotency_key: idempotencyKey,
    }).select("*").single();

    if (insErr) throw new Error(insErr.message);

    return json(200, {
      success: true,
      status: "submitted",
      collection: row,
      batch_id: batchId,
      message: "EFT debit submitted — wallet credits after bank settlement (typically 3–5 business days)",
      process_date: batch.json.process_date ?? null,
    });
  } catch (err) {
    console.error("bambora-eft-collect", err);
    return json(500, { error: err instanceof Error ? err.message : "EFT collect failed" });
  }
});
