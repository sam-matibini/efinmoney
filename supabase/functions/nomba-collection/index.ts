import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildNombaCallbackUrl,
  collectionUrlForCorridor,
  getNombaPayConfig,
  isNombaPayConfigured,
  nombaCollectionFetch,
  type NombaCorridor,
} from "../_shared/nomba-pay.ts";

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

function resolveCorridor(currency: string): NombaCorridor | null {
  const c = currency.toUpperCase();
  if (c === "NGN") return "nigeria";
  if (["USD", "EUR", "GBP"].includes(c)) return "international";
  return null;
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
    const userEmail = userData?.user?.email;
    if (authErr || !userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { amount, target_wallet_id, email, corridor: corridorHint, return_url } = body as Record<string, unknown>;

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return json({ error: "Amount must be at least 1" }, 400);
    if (!target_wallet_id || typeof target_wallet_id !== "string") {
      return json({ error: "Target wallet required" }, 400);
    }

    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `nomba_pay_collection:${userId}`,
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

    const currency = String(wallet.currency_code).toUpperCase();
    const corridor = (typeof corridorHint === "string" && corridorHint === "international")
      ? "international" as NombaCorridor
      : resolveCorridor(currency);
    if (!corridor) {
      return json({ error: `Nomba checkout does not support ${currency}` }, 400);
    }
    if (corridor === "nigeria" && currency !== "NGN") {
      return json({ error: "Nigeria checkout requires an NGN wallet" }, 400);
    }
    if (corridor === "international" && !["USD", "EUR", "GBP"].includes(currency)) {
      return json({ error: "International Nomba checkout supports USD, EUR, and GBP only" }, 400);
    }

    if (!isNombaPayConfigured()) {
      return json({ error: "Nomba Pay is not configured", code: "provider_not_configured" }, 500);
    }
    const cfg = getNombaPayConfig();

    const customerEmail = String(email || userEmail || "").trim();
    if (!customerEmail || !customerEmail.includes("@")) {
      return json({ error: "A valid email is required for checkout" }, 400);
    }

    const amountRounded = Math.round(amt * 100) / 100;
    const internalRef = `efin-nomba-${corridor}-${userId.slice(0, 8)}-${Date.now()}`;
    const returnUrl = typeof return_url === "string" && return_url.startsWith("http")
      ? return_url.trim()
      : null;

    const { data: txn, error: insErr } = await admin
      .from("nomba_pay_transactions")
      .insert({
        user_id: userId,
        corridor,
        reference: internalRef,
        amount: amountRounded,
        currency,
        email: customerEmail,
        target_wallet_id,
        status: "pending",
        raw_request: {
          corridor,
          amount: amountRounded,
          currency,
          email: customerEmail,
          return_url: returnUrl,
        },
      })
      .select("id")
      .single();

    if (insErr) return json({ error: "Could not record collection", detail: insErr.message }, 500);

    const payload = {
      currency,
      amount: String(amountRounded),
      user: cfg.merchantUser,
      callback: buildNombaCallbackUrl(),
      email: customerEmail,
    };

    const url = collectionUrlForCorridor(corridor);
    console.log("Nomba COLLECTION:", { corridor, url, payload });

    const result = await nombaCollectionFetch(url, payload);

    if (!result.ok) {
      await admin.from("nomba_pay_transactions").update({
        status: "failed",
        failure_reason: result.message,
        raw_response: result.json,
      }).eq("id", txn.id);
      return json({
        error: result.message,
        provider_response: result.json,
      }, 200);
    }

    await admin.from("nomba_pay_transactions").update({
      status: "processing",
      order_id: result.orderId,
      checkout_url: result.checkoutUrl,
      provider_reference: result.orderId,
      raw_response: result.json,
    }).eq("id", txn.id);

    return json({
      success: true,
      transaction_id: txn.id,
      order_id: result.orderId,
      payment_link: result.checkoutUrl,
      message: "Redirecting to secure Nomba checkout…",
      provider_response: result.json,
    });
  } catch (err) {
    console.error("nomba-collection error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
