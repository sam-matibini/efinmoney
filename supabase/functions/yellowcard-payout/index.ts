// Yellow Card NGN bank payout (mock-mode until YELLOWCARD_* secrets are set).
// Triggered after Crossmint confirms USDC received. Marks transfer
// 'pending_payout' when credentials are absent so admin can settle manually.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { transfer_id } = body ?? {};
    if (!transfer_id) return json({ error: "transfer_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: t, error } = await admin
      .from("crossmint_yellowcard_transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();
    if (error || !t) return json({ error: "transfer not found" }, 404);

    if (t.status === "success" || t.status === "payout_sent") {
      return json({ ok: true, already: t.status });
    }

    const ycKey = Deno.env.get("YELLOWCARD_API_KEY");
    const ycSecret = Deno.env.get("YELLOWCARD_SECRET");

    if (!ycKey || !ycSecret) {
      await admin
        .from("crossmint_yellowcard_transfers")
        .update({
          status: "pending_payout",
          failure_reason: "Yellow Card credentials not configured; awaiting onboarding.",
        })
        .eq("id", transfer_id);
      return json({ ok: true, mode: "pending_payout", message: "Yellow Card not yet onboarded" });
    }

    // Real Yellow Card payout call (placeholder structure)
    const env = (Deno.env.get("YELLOWCARD_ENV") ?? "sandbox").toLowerCase();
    const base =
      env === "production"
        ? "https://api.yellowcard.io/business"
        : "https://sandbox.api.yellowcard.io/business";

    const payload = {
      channelId: t.recipient_bank_code,
      sequenceId: t.id,
      amount: t.destination_amount ?? t.source_amount,
      currency: t.destination_currency,
      reason: "remittance",
      destination: {
        accountName: t.recipient_name,
        accountNumber: t.recipient_account_number,
        accountBank: t.recipient_bank_name,
        accountType: "bank",
        country: t.destination_country,
        phoneNumber: t.recipient_phone,
        networkRoutingNumber: t.recipient_bank_code,
      },
      sender: { name: "eFinMoney", country: "US" },
    };

    const resp = await fetch(`${base}/payments/payouts`, {
      method: "POST",
      headers: {
        "X-YC-API-KEY": ycKey,
        Authorization: `Bearer ${ycSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const ycData = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      await admin
        .from("crossmint_yellowcard_transfers")
        .update({ status: "failed", failure_reason: JSON.stringify(ycData), yellowcard_raw: ycData })
        .eq("id", transfer_id);
      return json({ error: "yellowcard payout failed", details: ycData }, 502);
    }

    await admin
      .from("crossmint_yellowcard_transfers")
      .update({
        status: "payout_sent",
        yellowcard_payment_id: ycData?.id ?? ycData?.paymentId ?? null,
        yellowcard_raw: ycData,
      })
      .eq("id", transfer_id);

    return json({ ok: true, yellowcard: ycData });
  } catch (e) {
    console.error("yellowcard-payout error", e);
    return json({ error: String(e) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
