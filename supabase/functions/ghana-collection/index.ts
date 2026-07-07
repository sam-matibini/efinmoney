import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildCallbackUrl,
  formatGhanaPhoneIntl,
  getGhanaPayConfig,
  ghanaPayFetch,
  isGhanaPayConfigured,
  newGhanaReference,
  newGhanaTransactionId,
  resolveGhanaNetwork,
} from "../_shared/ghana-pay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = userData?.user?.id;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { amount, target_wallet_id, phone, network, customer_name } = body as Record<string, unknown>;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return json({ error: "Amount must be at least 1 GHS" }, 400);
    if (!phone || typeof phone !== "string") return json({ error: "Phone number required" }, 400);
    if (!target_wallet_id || typeof target_wallet_id !== "string") {
      return json({ error: "Target wallet required" }, 400);
    }

    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `ghana_pay_collection:${userId}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return json({ error: "Too many top-up attempts. Try again in a minute." }, 429);

    const { data: wallet } = await userClient
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", target_wallet_id)
      .maybeSingle();
    if (!wallet || wallet.user_id !== userId) return json({ error: "Invalid wallet" }, 403);
    if (wallet.currency_code !== "GHS") {
      return json({ error: "Ghana Pay top-up is only available for GHS wallets" }, 400);
    }

    if (!isGhanaPayConfigured()) {
      return json({ error: "Ghana Pay is not configured", code: "provider_not_configured" }, 500);
    }
    const cfg = getGhanaPayConfig();

    const networkResolved = resolveGhanaNetwork(typeof network === "string" ? network : null);
    const customerNumber = formatGhanaPhoneIntl(phone);
    if (customerNumber.length < 12) return json({ error: "Enter a valid Ghana mobile number" }, 400);

    const amountRounded = Math.round(amt * 100) / 100;
    const providerTxnId = newGhanaTransactionId("efin-topup");
    const reference = newGhanaReference("topup", userId);
    const nickname = String(customer_name || userData?.user?.email || "Customer").trim();

    const { data: txn, error: insErr } = await admin
      .from("ghana_pay_transactions")
      .insert({
        user_id: userId,
        direction: "collection",
        reference,
        transaction_id: providerTxnId,
        amount: amountRounded,
        currency: "GHS",
        network: networkResolved,
        customer_number: customerNumber,
        nickname,
        target_wallet_id,
        status: "pending",
        raw_request: {
          user: cfg.merchantUser,
          customer_number: customerNumber,
          amount: amountRounded,
          network: networkResolved,
          reference,
          transaction_id: providerTxnId,
        },
      })
      .select("id")
      .single();

    if (insErr) return json({ error: "Could not record collection", detail: insErr.message }, 500);

    const payload = {
      user: cfg.merchantUser,
      call_back_url: buildCallbackUrl(),
      customer_number: customerNumber,
      nickname,
      transaction_id: providerTxnId,
      amount: amountRounded,
      reference,
      network: networkResolved,
    };

    console.log("Ghana Pay COLLECTION:", { url: cfg.collectionUrl, payload });

    const result = await ghanaPayFetch(cfg.collectionUrl, payload);

    if (result.duplicate) {
      await admin.from("ghana_pay_transactions").update({
        status: "failed",
        failure_reason: result.response_message,
        raw_response: result.json,
      }).eq("id", txn.id);
      return json({
        error: "Duplicate transaction — please try again",
        response_code: result.response_code,
        response_message: result.response_message,
      }, 200);
    }

    if (!result.ok) {
      const friendly = result.response_message
        || (result.httpStatus >= 500 ? "Ghana Pay is temporarily unavailable." : "Collection failed");
      await admin.from("ghana_pay_transactions").update({
        status: "failed",
        failure_reason: friendly,
        raw_response: result.json,
      }).eq("id", txn.id);
      return json({
        error: friendly,
        response_code: result.response_code,
        provider_response: result.json,
      }, 200);
    }

    await admin.from("ghana_pay_transactions").update({
      status: "processing",
      provider_reference: providerTxnId,
      raw_response: result.json,
    }).eq("id", txn.id);

    return json({
      success: true,
      transaction_id: txn.id,
      provider_transaction_id: providerTxnId,
      response_code: result.response_code,
      message: result.response_message || "Approve the MoMo prompt on your phone.",
      provider_response: result.json,
    });
  } catch (err) {
    console.error("ghana-collection error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
