import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PayoutRequest {
  transfer_id: string;
  phone_number: string;
  amount_kes: number;
  reference?: string;
  remarks?: string;
}

function normalizeMsisdn(phone: string): string {
  // Convert +254712345678 / 0712345678 / 254712345678 -> 254712345678
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

async function getDarajaToken(env: "sandbox" | "production"): Promise<string> {
  const key = Deno.env.get("MPESA_CONSUMER_KEY");
  const secret = Deno.env.get("MPESA_CONSUMER_SECRET");
  if (!key || !secret) throw new Error("MPESA_CONSUMER_KEY/SECRET not configured");

  const host = env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

  const auth = btoa(`${key}:${secret}`);
  const res = await fetch(`${host}/oauth/v1/generate/token?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Daraja auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: PayoutRequest = await req.json();
    const { transfer_id, phone_number, amount_kes, reference, remarks } = body;

    if (!transfer_id || !phone_number || !amount_kes || amount_kes <= 0) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify transfer belongs to user
    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .eq("sender_id", user.id)
      .single();

    if (tErr || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const env = (Deno.env.get("MPESA_ENVIRONMENT") || "sandbox") as "sandbox" | "production";
    const shortcode = Deno.env.get("MPESA_SHORTCODE");
    const initiatorName = Deno.env.get("MPESA_INITIATOR_NAME");
    const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL");
    const projectId = Deno.env.get("SUPABASE_PROJECT_ID") || Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];

    // Graceful fallback if M-Pesa secrets are not yet configured
    if (!shortcode || !initiatorName || !securityCredential || !Deno.env.get("MPESA_CONSUMER_KEY")) {
      console.warn("M-Pesa secrets not configured — running in stub mode");
      await supabase.from("transfers").update({
        status: "processing",
        provider_reference: `STUB-${transfer_id.slice(0, 8)}`,
      }).eq("id", transfer_id);

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "M-Pesa transfer queued",
        message: `Your transfer of KES ${amount_kes} to ${phone_number} is queued. Live payouts require M-Pesa API credentials.`,
        type: "info",
      });

      return new Response(JSON.stringify({
        success: true,
        stub: true,
        message: "M-Pesa credentials not configured — transfer marked as processing.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = await getDarajaToken(env);
    const host = env === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";

    const callbackBase = `https://${projectId}.functions.supabase.co/mpesa-webhook`;
    const msisdn = normalizeMsisdn(phone_number);

    const payload = {
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: "BusinessPayment",
      Amount: Math.round(amount_kes),
      PartyA: shortcode,
      PartyB: msisdn,
      Remarks: remarks || reference || `Transfer ${transfer_id.slice(0, 8)}`,
      QueueTimeOutURL: `${callbackBase}?type=timeout&transfer_id=${transfer_id}`,
      ResultURL: `${callbackBase}?type=result&transfer_id=${transfer_id}`,
      Occasion: reference || transfer_id.slice(0, 8),
    };

    const res = await fetch(`${host}/mpesa/b2c/v1/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();

    if (!res.ok || result.errorCode) {
      const reason = result.errorMessage || result.ResponseDescription || `HTTP ${res.status}`;
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer_id);

      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "M-Pesa transfer failed",
        message: reason,
        type: "error",
      });

      return new Response(JSON.stringify({ success: false, error: reason }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: result.ConversationID || result.OriginatorConversationID,
    }).eq("id", transfer_id);

    return new Response(JSON.stringify({
      success: true,
      conversation_id: result.ConversationID,
      response: result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("mpesa-payout error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
