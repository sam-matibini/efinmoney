import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import {
  buildSwychrPayinWebhookUrl,
  countryCodeForCurrency,
  createSwychrPaymentLink,
} from "../_shared/swychr-payin.ts";

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

  if (!isSwychrEnabled() || !isSwychrConfigured("payin")) {
    return json({ error: "Swychr payin is not enabled", code: "swychr_disabled" }, 503);
  }

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
    const userEmail = userData?.user?.email;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { amount, target_wallet_id, email, name, mobile, return_url } = body as Record<string, unknown>;

    const creditAmount = Number(amount);
    if (!Number.isFinite(creditAmount) || creditAmount < 1) {
      return json({ error: "Amount must be at least 1" }, 400);
    }
    if (!target_wallet_id || typeof target_wallet_id !== "string") {
      return json({ error: "Target wallet required" }, 400);
    }

    const { data: wallet } = await userClient
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", target_wallet_id)
      .maybeSingle();
    if (!wallet || wallet.user_id !== userId) return json({ error: "Invalid wallet" }, 403);

    const currency = String(wallet.currency_code).toUpperCase();
    const countryCode = countryCodeForCurrency(currency);
    const customerEmail = String(email || userEmail || "").trim();
    const customerName = String(name || userEmail?.split("@")[0] || "Customer").trim();
    if (!customerEmail.includes("@")) return json({ error: "Valid email required" }, 400);

    const transactionId = `efin-swychr-${userId.slice(0, 8)}-${Date.now()}`;
    const internalRef = transactionId;
    const callbackUrl = buildSwychrPayinWebhookUrl();

    const { data: txn, error: insErr } = await admin.from("swychr_payin_transactions").insert({
      user_id: userId,
      reference: internalRef,
      transaction_id: transactionId,
      amount: creditAmount,
      currency,
      country_code: countryCode,
      email: customerEmail,
      target_wallet_id,
      status: "pending",
      raw_request: { return_url, name: customerName, mobile },
    }).select("id").single();
    if (insErr || !txn) return json({ error: "Could not create transaction record" }, 500);

    const result = await createSwychrPaymentLink({
      country_code: countryCode,
      name: customerName,
      email: customerEmail,
      mobile: typeof mobile === "string" ? mobile : undefined,
      amount: creditAmount,
      currency,
      transaction_id: transactionId,
      description: `eFinMoney wallet top-up (${currency})`,
      pass_digital_charge: true,
      callback_url: callbackUrl || undefined,
    }, transactionId);

    if (!result.ok || !result.payment_link) {
      const detail = result.message
        || (typeof result.raw?.message === "string" ? result.raw.message : "")
        || "Could not create payment link";
      await admin.from("swychr_payin_transactions").update({
        status: "failed",
        failure_reason: detail,
        raw_response: result.raw,
      }).eq("id", txn.id);
      return json({
        error: detail,
        code: "swychr_payin_rejected",
        raw: result.raw,
      }, 502);
    }

    await admin.from("swychr_payin_transactions").update({
      status: "processing",
      payment_link: result.payment_link,
      provider_id: result.provider_id,
      raw_response: result.raw,
    }).eq("id", txn.id);

    return json({
      success: true,
      transaction_id: txn.id,
      payment_link: result.payment_link,
      swychr_transaction_id: transactionId,
      message: "Redirecting to secure checkout",
    });
  } catch (e) {
    console.error("swychr-collection error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
