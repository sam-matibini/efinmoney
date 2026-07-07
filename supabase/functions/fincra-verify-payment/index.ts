import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaFincra, isFincraWalletTopUp } from "../_shared/fincra-credit.ts";
import { fincraFetch } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function settleAmount(data: Record<string, unknown>): number {
  const candidates = [
    data.amountToSettle,
    data.amountReceived,
    data.convertedAmount,
    data.amount,
    data.amountExpected,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const url = new URL(req.url);
    const reference = url.searchParams.get("reference") || url.searchParams.get("tx_ref") || url.searchParams.get("merchantReference");
    if (!reference) {
      return new Response(JSON.stringify({ error: "reference required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ok, json } = await fincraFetch(
      `/checkout/payments/merchant-reference/${encodeURIComponent(reference)}`,
      { withBusinessId: true },
    );
    if (!ok) {
      return new Response(JSON.stringify({ verified: false, error: json?.message || json?.error || "Verification failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const d = (json?.data ?? {}) as Record<string, unknown>;
    const status = String(d.status || "").toLowerCase();
    if (status !== "success" && status !== "successful" && status !== "completed") {
      return new Response(JSON.stringify({ verified: false, status: d.status, error: `Payment status: ${d.status}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = (d.metadata ?? {}) as Record<string, unknown>;
    if (meta.user_id && meta.user_id !== user.id) {
      return new Response(JSON.stringify({ verified: false, error: "Transaction does not belong to you" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amount = settleAmount(d);
    const currency = String(d.currency || meta.currency || "").toUpperCase();
    const merchantRef = String(d.merchantReference || reference);
    const fincraId = String(d.id ?? d.reference ?? reference);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let credited = false;
    if (isFincraWalletTopUp(meta, merchantRef)) {
      const walletIdFromMeta = meta.wallet_id ? String(meta.wallet_id) : undefined;
      const { already } = await creditWalletViaFincra(
        admin, user.id, currency, amount, fincraId || merchantRef, walletIdFromMeta,
        `Top-up via Fincra (${merchantRef})`,
      );
      credited = !already;
    }

    return new Response(JSON.stringify({
      verified: true,
      status: d.status,
      amount,
      currency,
      reference: merchantRef,
      credited,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("fincra-verify-payment error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Verification failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
