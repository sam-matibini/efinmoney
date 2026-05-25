import {
  MTN_BASE_URL,
  MTN_TARGET_ENV,
  getRemittanceToken,
  getServiceClient,
  mtnPrimaryKey,
} from "../_shared/mtn-momo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map ISO currency -> MSISDN country dial-code prefix sanity (informational only).
const SUPPORTED_CURRENCIES = new Set(["EUR", "GHS", "UGX", "ZMW", "XOF", "XAF"]);

function sanitizeMsisdn(phone: string): string {
  return (phone || "").replace(/[^0-9]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = getServiceClient();

  try {
    const body = await req.json().catch(() => ({}));
    const { transfer_id } = body;
    if (!transfer_id) {
      return new Response(JSON.stringify({ success: false, error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) {
      return new Response(JSON.stringify({ success: false, error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Number(transfer.target_amount ?? transfer.source_amount);
    // Sandbox only accepts EUR. Use EUR in sandbox; real currency in production targets.
    const currency = MTN_TARGET_ENV === "sandbox"
      ? "EUR"
      : (transfer.target_currency || "EUR").toUpperCase();
    const msisdn = sanitizeMsisdn(transfer.recipient_phone || "");

    if (!amount || amount <= 0) {
      return new Response(JSON.stringify({ success: false, error: "Invalid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!msisdn) {
      return new Response(JSON.stringify({ success: false, error: "Missing recipient phone" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (MTN_TARGET_ENV !== "sandbox" && !SUPPORTED_CURRENCIES.has(currency)) {
      return new Response(JSON.stringify({ success: false, error: `Unsupported MTN currency ${currency}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getRemittanceToken(supabase);
    const referenceId = crypto.randomUUID();

    const payload = {
      amount: String(amount.toFixed(2)),
      currency,
      externalId: transfer_id,
      payee: { partyIdType: "MSISDN", partyId: msisdn },
      payerMessage: `Payout ${transfer_id.slice(0, 8)}`,
      payeeNote: `eFinMoney to ${transfer.recipient_name || "recipient"}`,
    };

    const res = await fetch(`${MTN_BASE_URL}/remittance/v1_0/transfer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Reference-Id": referenceId,
        "X-Target-Environment": MTN_TARGET_ENV,
        "Ocp-Apim-Subscription-Key": mtnPrimaryKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // MTN returns 202 Accepted with empty body on success
    if (res.status !== 202) {
      const txt = await res.text();
      console.error("MTN transfer failed:", res.status, txt);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: `MTN error ${res.status}: ${txt.slice(0, 300)}`,
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({
        success: false,
        error: `MTN payout failed (${res.status})`,
        provider_response: txt,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: referenceId,
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({
      success: true,
      provider_reference: referenceId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("mtn-momo-payout error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
