import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { elicateCheckoutPay, extractRedirectUrl, extractTransactionId, getElicateConfig } from "../_shared/elicate.ts";

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

function normalizeZmPhone(raw?: string | null): string {
  let phone = String(raw || "").replace(/[^\d]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("260")) phone = phone.slice(3);
  if (!phone.startsWith("0")) phone = "0" + phone;
  return phone;
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

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const amount = Number(body.amount);
    const phone = typeof body.phone === "string" ? body.phone : "";
    const network = String(body.network || "MTN").toUpperCase();
    const customerName = String(body.customer_name || "Customer");
    const walletId = typeof body.target_wallet_id === "string" ? body.target_wallet_id : null;
    const linkSlug = typeof body.link_slug === "string" ? body.link_slug : null;

    if (!Number.isFinite(amount) || amount < 1) return json({ error: "Amount must be at least 1 ZMW" }, 400);
    if (!phone) return json({ error: "Phone required" }, 400);

    const cfg = getElicateConfig();
    if (!cfg.publicKey && !linkSlug) {
      return json({ error: "Public key not configured" }, 500);
    }

    let targetWallet = walletId;
    if (!targetWallet) {
      const { data: w } = await admin.from("wallets")
        .select("id").eq("user_id", user.id).eq("currency_code", "ZMW").maybeSingle();
      targetWallet = w?.id ?? null;
    }

    const reference = `efin_checkout_${user.id.slice(0, 8)}_${Date.now()}`;
    const phoneNormalized = normalizeZmPhone(phone);

    if (targetWallet) {
      await admin.from("elicate_charges").insert({
        user_id: user.id,
        reference,
        amount_minor: Math.round(amount * 100),
        currency: "ZMW",
        target_wallet_id: targetWallet,
        phone: phoneNormalized,
        network,
        customer_name: customerName,
        status: "pending",
        raw_request: body,
      });
    }

    const payload: Record<string, unknown> = {
      customer_name: customerName,
      phone: phoneNormalized,
      network,
      amount,
      reference,
      description: typeof body.description === "string" ? body.description : "eFinMoney ZMW collect",
    };
    if (linkSlug) payload.link_slug = linkSlug;
    else payload.public_key = cfg.publicKey;

    const result = await elicateCheckoutPay(payload);
    if (!result.ok) {
      return json({ error: result.error || "Checkout failed", raw: result.data, mode: cfg.mode }, 502);
    }

    const txId = extractTransactionId(result.data);
    const redirectUrl = extractRedirectUrl(result.data);

    if (targetWallet && txId) {
      await admin.from("elicate_charges").update({
        status: "awaiting_approval",
        psp_reference: txId,
        redirect_url: redirectUrl,
        raw_response: result.data,
      }).eq("reference", reference);
    }

    return json({
      success: true,
      transaction_id: txId,
      redirect_url: redirectUrl,
      reference,
      status: result.data.status ?? "pending",
      mode: cfg.mode,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
