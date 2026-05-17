import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ELICATE_BASE_URL = Deno.env.get("ELICATE_BASE_URL") || "https://api.elicatepay.com/v1";

// Map internal payout_method codes -> Elicate network identifier for ZMW
const NETWORK_MAP: Record<string, string> = {
  mtn_mobile: "mtn",
  airtel_money: "airtel",
  zamtel_money: "zamtel",
  mtn: "mtn",
  airtel: "airtel",
  zamtel: "zamtel",
};

function resolveNetwork(payoutMethod?: string | null): string {
  if (!payoutMethod) return "mtn";
  return NETWORK_MAP[payoutMethod.toLowerCase()] || "mtn";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { transfer_id } = await req.json().catch(() => ({}));
    if (!transfer_id) {
      return new Response(JSON.stringify({ success: false, error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = Deno.env.get("ELICATE_SECRET_KEY");
    if (!secret) {
      return new Response(JSON.stringify({ success: false, error: "ELICATE_SECRET_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();

    if (tErr || !transfer) {
      return new Response(JSON.stringify({ success: false, error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = `EFM-ELC-${transfer_id.slice(0, 8)}-${Date.now()}`;
    const payload = {
      amount: Number(transfer.target_amount ?? transfer.source_amount),
      currency: "ZMW",
      recipient_phone: transfer.recipient_phone,
      recipient_name: transfer.recipient_name,
      network: resolveNetwork(transfer.payout_method),
      reference,
      narration: `Payout to ${transfer.recipient_name}`,
    };

    const res = await fetch(`${ELICATE_BASE_URL}/payouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respJson = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("Elicate payout failed:", res.status, respJson);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: respJson?.message || respJson?.error || `Elicate error ${res.status}`,
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({
        success: false,
        error: respJson?.message || respJson?.error || "Elicate payout failed",
        provider_status: res.status,
        provider_response: respJson,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const providerRef =
      respJson?.data?.reference ||
      respJson?.data?.id ||
      respJson?.reference ||
      respJson?.id ||
      reference;

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: providerRef,
      payout_provider: "elicate",
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({
      success: true,
      provider_reference: providerRef,
      provider_response: respJson,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("elicate-payout error:", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
