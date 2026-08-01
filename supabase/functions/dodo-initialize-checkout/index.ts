import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  dodoFetch,
  ensureTopupProduct,
  getDodoConfig,
  isDodoConfigured,
  toMinorUnits,
} from "../_shared/dodo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORTED = new Set(["USD", "CAD", "EUR", "GBP"]);

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    if (!isDodoConfigured()) {
      return jr(500, { error: "Dodo Payments is not configured (DODO_PAYMENTS_API_KEY)" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const walletId = body?.walletId ? String(body.walletId) : "";
    const currency = String(body?.currency || "USD").toUpperCase();
    const amount = Number(body?.amount);
    const redirectUrl = String(body?.redirectUrl || "").trim();

    if (!SUPPORTED.has(currency)) {
      return jr(400, { error: `Dodo top-up supports: ${[...SUPPORTED].join(", ")}` });
    }
    if (!Number.isFinite(amount) || amount < 1) {
      return jr(400, { error: "Minimum top-up is 1.00" });
    }
    if (!redirectUrl) return jr(400, { error: "redirectUrl required" });
    if (!walletId) return jr(400, { error: "walletId required" });

    const { data: w } = await supabase.from("wallets")
      .select("id, user_id, currency_code").eq("id", walletId).maybeSingle();
    if (!w || w.user_id !== user.id) return jr(403, { error: "Wallet not accessible" });
    if (String(w.currency_code).toUpperCase() !== currency) {
      return jr(400, { error: `Wallet currency (${w.currency_code}) does not match ${currency}` });
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `dodo_topup:${user.id}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return jr(429, { error: "Too many requests" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles")
      .select("email, full_name, first_name, last_name").eq("user_id", user.id).maybeSingle();

    const email = profile?.email || user.email || `${user.id}@efin.money`;
    const name = (profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "eFinMoney User").slice(0, 100);
    const productId = await ensureTopupProduct(currency);
    const minor = toMinorUnits(amount, currency);
    const reference = `efm_dodo_${user.id.slice(0, 8)}_${Date.now().toString(36)}`;

    const checkout = await dodoFetch("/checkouts", {
      method: "POST",
      json: {
        product_cart: [{ product_id: productId, quantity: 1, amount: minor }],
        customer: { email, name },
        return_url: redirectUrl.includes("?")
          ? `${redirectUrl}&dodo=1&ref=${encodeURIComponent(reference)}`
          : `${redirectUrl}?dodo=1&ref=${encodeURIComponent(reference)}`,
        metadata: {
          type: "wallet_topup",
          user_id: user.id,
          wallet_id: walletId,
          currency,
          amount: String(Math.round(amount * 100) / 100),
          reference,
        },
      },
    });

    if (!checkout.ok) {
      return jr(checkout.status || 502, {
        error: String(checkout.json?.message || checkout.json?.error || "Dodo checkout failed"),
        provider: checkout.json,
      });
    }

    const sessionId = String(checkout.json?.session_id || checkout.json?.checkout_session_id || "");
    const paymentLink = String(
      checkout.json?.checkout_url ||
      checkout.json?.payment_link ||
      checkout.json?.url ||
      "",
    );

    if (!paymentLink) {
      return jr(502, { error: "Dodo did not return a checkout URL", provider: checkout.json });
    }

    // Persist pending row for return-URL verify (table may not exist yet — ignore errors)
    try {
      await admin.from("dodo_payin_transactions").upsert({
        id: reference,
        user_id: user.id,
        wallet_id: walletId,
        currency,
        amount: Math.round(amount * 100) / 100,
        session_id: sessionId || null,
        status: "pending",
        raw: checkout.json,
      }, { onConflict: "id" });
    } catch { /* optional table */ }

    const cfg = getDodoConfig();
    return jr(200, {
      success: true,
      checkout_url: paymentLink,
      session_id: sessionId,
      reference,
      env: cfg.env,
    });
  } catch (err) {
    console.error("dodo-initialize-checkout", err);
    return jr(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
