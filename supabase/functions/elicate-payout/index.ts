import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ELICATE_URL =
  Deno.env.get("ELICATE_BASE_URL") ||
  "https://elicatepay.vercel.app/api/v1/payments/charge";

// Map internal payout_method / network codes -> Elicate uppercase network string
const NETWORK_MAP: Record<string, string> = {
  mtn: "MTN",
  mtn_mobile: "MTN",
  mtn_zambia: "MTN",
  mtn_money: "MTN",
  airtel: "AIRTEL",
  airtel_money: "AIRTEL",
  airtel_zambia: "AIRTEL",
  zamtel: "ZAMTEL",
  zamtel_money: "ZAMTEL",
};

function resolveNetwork(input?: string | null): string {
  if (!input) return "MTN";
  const key = input.toLowerCase();
  if (NETWORK_MAP[key]) return NETWORK_MAP[key];
  // Heuristic fallback: contains substring
  if (key.includes("mtn")) return "MTN";
  if (key.includes("airtel")) return "AIRTEL";
  if (key.includes("zamtel")) return "ZAMTEL";
  return input.toUpperCase();
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

    const network = resolveNetwork(transfer.payout_method || transfer.recipient_network);
    const payload = {
      amount: Number(transfer.target_amount ?? transfer.source_amount),
      phone: transfer.recipient_phone,
      network,
    };

    console.log("Elicate payout request:", { url: ELICATE_URL, payload });

    const res = await fetch(ELICATE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respText = await res.text();
    console.log("Elicate payout response:", res.status, respText);

    let respJson: any = {};
    try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }

    if (!res.ok) {
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
      respJson?.transactionId ||
      `EFM-ELC-${transfer_id.slice(0, 8)}-${Date.now()}`;

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: providerRef,
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
