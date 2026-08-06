/**
 * Create a Square-hosted Checkout (Payment Link) for wallet top-up.
 * Avoids Web Payments SDK iframe issues with browser extensions.
 *
 * Body: { walletId, amount, currency, redirectUrl }
 * Docs: https://developer.squareup.com/docs/checkout-api/quick-pay-checkout
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getSquareConfig, squareConfigured, squareFetch, toSquareAmountMoney } from "../_shared/square.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const cfg = getSquareConfig();
    if (!squareConfigured(cfg)) return jr(503, { error: "Square is not configured" });

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const walletId = String(body.walletId || body.wallet_id || "").trim();
    const currency = String(body.currency || "CAD").toUpperCase();
    const amount = Number(body.amount);
    let redirectUrl = String(body.redirectUrl || body.redirect_url || "").trim();

    if (!walletId) return jr(400, { error: "walletId required" });
    if (!SUPPORTED.has(currency)) return jr(400, { error: `Supports ${[...SUPPORTED].join(", ")}` });
    if (!Number.isFinite(amount) || amount < 1) return jr(400, { error: "Minimum top-up is 1.00" });
    if (amount > 50_000) return jr(400, { error: "Amount exceeds safety limit" });
    if (!redirectUrl) return jr(400, { error: "redirectUrl required" });

    try {
      const u = new URL(redirectUrl);
      u.searchParams.set("square", "1");
      redirectUrl = u.toString();
    } catch {
      redirectUrl = redirectUrl.includes("?")
        ? `${redirectUrl}&square=1`
        : `${redirectUrl}?square=1`;
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: wallet, error: walletErr } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (walletErr) {
      console.error("wallet lookup", walletErr);
      return jr(500, { error: `Wallet lookup failed: ${walletErr.message}` });
    }
    if (!wallet || wallet.user_id !== user.id) return jr(403, { error: "Wallet not found" });
    if (String(wallet.currency_code).toUpperCase() !== currency) {
      return jr(400, { error: `Wallet currency is ${wallet.currency_code}, not ${currency}` });
    }

    const money = toSquareAmountMoney(amount, currency);
    const amountMinor = Number(money.amount);
    const amountMajor = Math.round(amount * 100) / 100;
    const idempotencyKey = crypto.randomUUID();
    const intentId = crypto.randomUUID();

    // Persist intent (non-fatal — verify can recover from payment_note)
    const { error: intentErr } = await admin.from("square_checkout_intents").insert({
      id: intentId,
      user_id: user.id,
      wallet_id: walletId,
      amount: amountMajor,
      currency,
      status: "pending",
    });
    if (intentErr) {
      console.error("square intent insert (continuing)", intentErr);
    }

    const paymentBody: Record<string, unknown> = {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: `eFinMoney ${currency} wallet top-up`,
        price_money: {
          amount: amountMinor,
          currency: money.currency,
        },
        location_id: cfg.locationId,
      },
      checkout_options: {
        redirect_url: redirectUrl,
        ask_for_shipping_address: false,
      },
      payment_note: `efm-topup|${intentId}|${walletId}|${user.id}|${amountMajor}|${currency}`.slice(0, 500),
    };
    if (user.email) {
      paymentBody.pre_populated_data = { buyer_email: user.email };
    }

    const { ok, status, json } = await squareFetch("/v2/online-checkout/payment-links", {
      method: "POST",
      body: JSON.stringify(paymentBody),
    });

    if (!ok) {
      const detail = String(json?.errors?.[0]?.detail || json?.errors?.[0]?.code || `Square HTTP ${status}`);
      console.error("square-create-checkout failed", status, json);
      await admin.from("square_checkout_intents").update({ status: "failed" }).eq("id", intentId);
      return jr(400, { error: detail, square: json?.errors ?? null });
    }

    const link = (json?.payment_link ?? {}) as Record<string, unknown>;
    const checkoutUrl = String(link.url || "");
    const orderId = String(link.order_id || "");
    const paymentLinkId = String(link.id || "");

    if (!checkoutUrl) {
      await admin.from("square_checkout_intents").update({ status: "failed" }).eq("id", intentId);
      return jr(502, { error: "Square returned no checkout URL", raw: json });
    }

    // Best-effort: attach order_id for verify lookup
    const { error: updErr } = await admin.from("square_checkout_intents").update({
      payment_link_id: paymentLinkId || null,
      order_id: orderId || null,
    }).eq("id", intentId);
    if (updErr) {
      // Insert may have failed earlier — upsert so verify can find the order
      console.error("square intent update", updErr);
      await admin.from("square_checkout_intents").upsert({
        id: intentId,
        user_id: user.id,
        wallet_id: walletId,
        amount: amountMajor,
        currency,
        status: "pending",
        payment_link_id: paymentLinkId || null,
        order_id: orderId || null,
      }, { onConflict: "id" });
    }

    // Always put orderId on redirect for local sessionStorage-less recovery
    let finalUrl = checkoutUrl;
    try {
      // Square returns checkout URL; order_id is also returned to client for sessionStorage
    } catch { /* ignore */ }
    void finalUrl;

    return jr(200, {
      success: true,
      checkout_url: checkoutUrl,
      order_id: orderId,
      payment_link_id: paymentLinkId,
      intent_id: intentId,
    });
  } catch (err) {
    console.error("square-create-checkout", err);
    return jr(500, { error: err instanceof Error ? err.message : "Checkout failed" });
  }
});
