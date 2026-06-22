import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const walletId = String(body.wallet_id || "");
    const amount = Number(body.amount);
    const payeeName = String(body.payee_name || "").trim();
    const category = String(body.category || "other").trim().toLowerCase();
    const accountReference = String(body.account_reference || "").trim();
    const memo = body.memo ? String(body.memo).trim() : null;
    const institution = String(body.institution || "").replace(/\D/g, "");
    const transit = String(body.transit || "").replace(/\D/g, "");
    const accountNumber = String(body.account_number || "").replace(/\D/g, "");

    if (!walletId || !payeeName || !accountReference) {
      return jsonResponse({ error: "Payee name, account reference, and wallet are required" }, 400);
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return jsonResponse({ error: "Minimum bill payment is C$1.00" }, 400);
    }
    if (amount > 25000) {
      return jsonResponse({ error: "Maximum bill payment is C$25,000 per transaction" }, 400);
    }
    if (!/^\d{3}$/.test(institution) || !/^\d{5}$/.test(transit) || accountNumber.length < 5) {
      return jsonResponse({
        error: "Enter valid Canadian bank details: 3-digit institution, 5-digit transit, and account number",
      }, 400);
    }

    const { data: wallet } = await admin
      .from("wallets")
      .select("id, currency_code, user_id")
      .eq("id", walletId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!wallet || wallet.currency_code !== "CAD") {
      return jsonResponse({ error: "Select a valid CAD wallet" }, 400);
    }

    const { data: balData } = await admin.rpc("get_wallet_balance", { p_wallet_id: walletId });
    if (Number(balData || 0) < amount) {
      return jsonResponse({ error: "Insufficient CAD wallet balance" }, 400);
    }

    const { data: rl } = await supabaseUser.rpc("check_rate_limit", {
      p_key: `ca_bill:${user.id}`,
      p_max_requests: 5,
      p_window_seconds: 60,
    });
    if (rl === false) return jsonResponse({ error: "Too many requests — try again shortly" }, 429);

    const reference = `efm_cabill_${user.id.slice(0, 8)}_${Date.now()}`;
    const eftAccount = `${institution}-${transit}-${accountNumber}`;

    const { data: bill, error: billErr } = await admin.from("bill_payments").insert({
      user_id: user.id,
      wallet_id: walletId,
      category: `ca_${category}`,
      biller_code: "ca_eft",
      biller_name: payeeName,
      customer_identifier: accountReference,
      amount,
      currency: "CAD",
      reference,
      status: "pending",
    }).select("id").single();
    if (billErr) throw billErr;

    const { data: transfer, error: transferErr } = await admin.from("transfers").insert({
      sender_id: user.id,
      sender_wallet_id: walletId,
      recipient_name: payeeName,
      recipient_account: eftAccount,
      recipient_bank_name: accountReference,
      recipient_country: "CA",
      transfer_type: "bill_payment",
      payout_method: "eft",
      funding_source: "wallet",
      source_currency: "CAD",
      target_currency: "CAD",
      source_amount: amount,
      target_amount: amount,
      exchange_rate: 1,
      fee_amount: 0,
      status: "initiated",
    }).select("id").single();
    if (transferErr) {
      await admin.from("bill_payments").update({ status: "failed", failure_reason: transferErr.message }).eq("id", bill.id);
      throw transferErr;
    }

    await admin.from("bill_payments").update({ flw_reference: transfer.id }).eq("id", bill.id);

    const execRes = await fetch(`${SUPABASE_URL}/functions/v1/execute-transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ transfer_id: transfer.id }),
    });
    const execJson = await execRes.json().catch(() => ({}));

    if (!execRes.ok || execJson.success === false) {
      const err = execJson.error || "Bill payment could not be completed";
      await admin.from("bill_payments").update({
        status: "failed",
        failure_reason: err,
        flw_response: execJson,
      }).eq("id", bill.id);
      return jsonResponse({
        success: false,
        error: err,
        bill_id: bill.id,
        transfer_id: transfer.id,
      }, 400);
    }

    await admin.from("bill_payments").update({
      status: "processing",
      flw_response: execJson,
    }).eq("id", bill.id);

    return jsonResponse({
      success: true,
      bill_id: bill.id,
      transfer_id: transfer.id,
      reference,
      payout: execJson.payout ?? null,
    });
  } catch (err) {
    console.error("ca-bill-payment error:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : "Bill payment failed" }, 500);
  }
});
