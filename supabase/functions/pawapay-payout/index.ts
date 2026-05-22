import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map ISO country + currency -> PawaPay correspondent (MNO) token.
// Default values picked per PawaPay's standard correspondent list. Extend as needed.
function resolveCorrespondent(country: string, currency: string, payoutMethod?: string | null): string {
  const c = (country || "").toUpperCase();
  const m = (payoutMethod || "").toUpperCase();

  const table: Record<string, Record<string, string>> = {
    SN: { ORANGE: "ORANGE_SEN", FREE: "FREE_SEN", WAVE: "WAVE_SEN", DEFAULT: "ORANGE_SEN" },
    CM: { MTN: "MTN_MOMO_CMR", ORANGE: "ORANGE_CMR", DEFAULT: "MTN_MOMO_CMR" },
    CI: { MTN: "MTN_MOMO_CIV", ORANGE: "ORANGE_CIV", MOOV: "MOOV_CIV", DEFAULT: "ORANGE_CIV" },
    BF: { ORANGE: "ORANGE_BFA", MOOV: "MOOV_BFA", DEFAULT: "ORANGE_BFA" },
    BJ: { MTN: "MTN_MOMO_BEN", MOOV: "MOOV_BEN", DEFAULT: "MTN_MOMO_BEN" },
    KE: { MPESA: "MPESA_KEN", AIRTEL: "AIRTEL_OAPI_KEN", DEFAULT: "MPESA_KEN" },
    UG: { MTN: "MTN_MOMO_UGA", AIRTEL: "AIRTEL_OAPI_UGA", DEFAULT: "MTN_MOMO_UGA" },
    TZ: { AIRTEL: "AIRTEL_OAPI_TZA", VODACOM: "VODACOM_TZS", TIGO: "TIGO_TZS", HALOPESA: "HALOPESA_TZS", DEFAULT: "AIRTEL_OAPI_TZA" },
    RW: { MTN: "MTN_MOMO_RWA", AIRTEL: "AIRTEL_RWA", DEFAULT: "MTN_MOMO_RWA" },
    ZM: { MTN: "MTN_MOMO_ZMB", AIRTEL: "AIRTEL_OAPI_ZMB", ZAMTEL: "ZAMTEL_ZMB", DEFAULT: "MTN_MOMO_ZMB" },
    GH: { MTN: "MTN_MOMO_GHA", VODAFONE: "VODAFONE_GHA", AIRTELTIGO: "AIRTELTIGO_GHA", DEFAULT: "MTN_MOMO_GHA" },
    MW: { AIRTEL: "AIRTEL_OAPI_MWI", TNM: "TNM_MWI", DEFAULT: "AIRTEL_OAPI_MWI" },
  };

  const entry = table[c];
  if (!entry) throw new Error(`PawaPay: unsupported country ${c}`);
  return entry[m] || entry.DEFAULT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const token = Deno.env.get("PAWAPAY_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "PAWAPAY_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const { transfer_id } = body;
    if (!transfer_id) {
      return new Response(JSON.stringify({ success: false, error: "transfer_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) {
      return new Response(JSON.stringify({ success: false, error: "Transfer not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const phone = (transfer.recipient_phone || "").replace(/\D/g, "");
    if (!phone) {
      return new Response(JSON.stringify({ success: false, error: "Recipient phone required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const correspondent = resolveCorrespondent(
      transfer.recipient_country,
      transfer.target_currency,
      transfer.payout_method,
    );

    const payoutId = crypto.randomUUID();
    const amount = Number(transfer.target_amount).toFixed(2);

    const payload = {
      payoutId,
      amount,
      currency: (transfer.target_currency || "").toUpperCase(),
      correspondent,
      recipient: { type: "MSISDN", address: { value: phone } },
      customerTimestamp: new Date().toISOString(),
      statementDescription: `eFinMoney ${transfer_id.slice(0, 8)}`.slice(0, 22),
    };

    const baseUrl = Deno.env.get("PAWAPAY_BASE_URL") || "https://api.sandbox.pawapay.cloud";
    const url = `${baseUrl}/v1/payouts`;
    console.log("PAWAPAY REQUEST:", JSON.stringify({ url, payload }));

    let res: Response;
    let responseBody = "";
    let data: Record<string, unknown> = {};
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      responseBody = await res.text();
      console.log("PAWAPAY RESPONSE:", res.status, responseBody);
      try { data = responseBody ? JSON.parse(responseBody) : {}; } catch { data = {}; }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "fetch failed";
      console.error("PAWAPAY FETCH ERROR:", msg);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: `PawaPay network error: ${msg}`.slice(0, 500),
        provider_reference: payoutId,
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({ success: false, error: msg, payoutId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const okStatuses = [200, 201, 202];
    const apiStatus = (typeof (data as { status?: unknown })?.status === "string"
      ? (data as { status: string }).status
      : "").toUpperCase();
    const isApiOk = okStatuses.includes(res.status);
    const isStatusFailure = apiStatus === "REJECTED" || apiStatus === "FAILED" || apiStatus === "DUPLICATE_IGNORED";

    if (!isApiOk || isStatusFailure) {
      const d = data as {
        rejectionReason?: { rejectionMessage?: string };
        failureReason?: { failureMessage?: string };
        errorMessage?: string;
        message?: string;
      };
      const reason =
        d?.rejectionReason?.rejectionMessage ||
        d?.failureReason?.failureMessage ||
        d?.errorMessage ||
        d?.message ||
        responseBody ||
        `HTTP ${res.status}`;
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: `PawaPay: ${reason}`.slice(0, 500),
        provider_reference: payoutId,
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({ success: false, error: reason, payoutId, http_status: res.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: payoutId,
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({ success: true, payoutId, status: apiStatus || "ACCEPTED" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("pawapay-payout error:", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
