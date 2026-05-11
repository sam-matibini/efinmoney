import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await supabase.auth.getClaims(token);
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const amount = Number(body?.amount);
    const currency = (body?.currency || "NGN").toString().toUpperCase();
    const paymentMethod = (body?.paymentMethod || "card").toString();
    const redirectUrl = (body?.redirectUrl || "").toString();
    if (!Number.isFinite(amount) || amount <= 0) return new Response(JSON.stringify({ error: "Invalid amount" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!redirectUrl) return new Response(JSON.stringify({ error: "redirectUrl required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_topup:${userId}`, p_max_requests: 10, p_window_seconds: 60 });
    if (rl === false) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("email, first_name, last_name, phone").eq("user_id", userId).maybeSingle();

    const FLW_KEY = Deno.env.get("FLW_SECRET_KEY");
    if (!FLW_KEY) return new Response(JSON.stringify({ error: "Flutterwave not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const txRef = `efm_topup_${userId.slice(0, 8)}_${Date.now()}`;

    const flwRes = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${FLW_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: txRef,
        amount: String(amount),
        currency,
        redirect_url: redirectUrl,
        payment_options: paymentMethod,
        customer: {
          email: profile?.email,
          phonenumber: profile?.phone || "",
          name: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || profile?.email,
        },
        customizations: {
          title: "eFin Money Wallet Top-up",
          description: "Add funds to your eFin Money wallet",
        },
        meta: { user_id: userId, type: "wallet_topup", currency },
      }),
    });
    const flwJson = await flwRes.json();
    if (!flwRes.ok || flwJson?.status !== "success") {
      console.error("FLW init payment failed", flwJson);
      return new Response(JSON.stringify({ error: flwJson?.message || "Failed to initialize payment" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ payment_link: flwJson.data.link, tx_ref: txRef }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-initialize-payment error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
