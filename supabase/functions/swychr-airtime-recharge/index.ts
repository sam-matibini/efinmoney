import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import { createSwychrRecharge } from "../_shared/swychr-airtime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isSwychrEnabled() || !isSwychrConfigured("airtime")) {
    return new Response(JSON.stringify({ error: "Swychr airtime disabled" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const { country, skuId, amount, mobile, wallet_id, purchaseCurrency } = body as Record<string, unknown>;

  if (!country || !skuId || !amount || !mobile) {
    return new Response(JSON.stringify({ error: "country, skuId, amount, mobile required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const transactionId = `efin-airtime-${user.id.slice(0, 8)}-${Date.now()}`;
  const currency = String(purchaseCurrency ?? "NGN").toUpperCase();

  await admin.from("swychr_airtime_transactions").insert({
    user_id: user.id,
    wallet_id: typeof wallet_id === "string" ? wallet_id : null,
    transaction_id: transactionId,
    country_code: String(country).toUpperCase(),
    sku_id: String(skuId),
    mobile: String(mobile),
    amount: Number(amount),
    currency,
    status: "processing",
    raw_request: body,
  });

  const result = await createSwychrRecharge({
    country: String(country).toUpperCase(),
    skuId: String(skuId),
    amount: Number(amount),
    mobile: String(mobile),
    purchaseCurrency: currency,
  });

  const ok = Boolean((result as Record<string, unknown>).ok ?? (result as Record<string, unknown>).status === 200);
  await admin.from("swychr_airtime_transactions").update({
    status: ok ? "completed" : "failed",
    raw_response: result,
    failure_reason: ok ? null : String((result as Record<string, unknown>).message ?? "Recharge failed"),
  }).eq("transaction_id", transactionId);

  return new Response(JSON.stringify({
    success: ok,
    transaction_id: transactionId,
    ...result as Record<string, unknown>,
  }), {
    status: ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
