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
  if (key.includes("mtn")) return "MTN";
  if (key.includes("airtel")) return "AIRTEL";
  if (key.includes("zamtel")) return "ZAMTEL";
  return input.toUpperCase();
}

// Normalize to local Zambian format (e.g. 0961234567)
function normalizeZmPhone(raw?: string | null): string {
  let phone = String(raw || "").replace(/[^\d]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("260")) phone = phone.slice(3);
  if (!phone.startsWith("0")) phone = "0" + phone;
  return phone;
}

function buildReference(transferId: string, existing?: string | null): string {
  const candidate = String(existing || "").trim();
  if (candidate) return candidate;
  return transferId;
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
    const phone = normalizeZmPhone(transfer.recipient_phone);
    const amount = Math.round(Number(transfer.target_amount ?? transfer.source_amount) * 100) / 100;
    const reference = buildReference(transfer_id, transfer.provider_reference);
    const customerName = String(transfer.recipient_name || "Customer").trim() || "Customer";

    const payload = {
      amount,
      phone,
      network,
      currency: "ZMW",
      reference,
      customer_name: customerName,
    };

    console.log("Elicate charge request:", { url: ELICATE_URL, payload });

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
    console.log("Elicate charge response:", res.status, respText);

    let respJson: any = {};
    try { respJson = JSON.parse(respText); } catch { respJson = { raw: respText }; }

    if (!res.ok) {
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: respJson?.message || respJson?.error || `Elicate error ${res.status}`,
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({
        success: false,
        error: respJson?.message || respJson?.error || "Elicate charge failed",
        provider_status: res.status,
        provider_response: respJson,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Extract documented fields: transaction_id + meta.authorization.redirect_url
    const data = respJson?.data || respJson;
    const transactionId =
      data?.transaction_id || data?.transactionId || data?.id || null;
    const providerReference =
      transactionId || data?.reference || reference;
    const redirectUrl =
      data?.meta?.authorization?.redirect_url ||
      data?.authorization?.redirect_url ||
      data?.redirect_url ||
      respJson?.redirect_url ||
      null;

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: providerReference,
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({
      success: true,
      transaction_id: transactionId,
      redirect_url: redirectUrl,
      provider_reference: providerReference,
      provider_response: respJson,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("elicate-payout error:", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
