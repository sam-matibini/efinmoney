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
  // Trim to defend against trailing newlines/spaces pasted into secrets
  const key = (Deno.env.get("MPESA_CONSUMER_KEY") || "").trim();
  const secret = (Deno.env.get("MPESA_CONSUMER_SECRET") || "").trim();
  if (!key || !secret) throw new Error("MPESA_CONSUMER_KEY/SECRET not configured");

  const host = env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

  console.log(`Daraja auth: env=${env}, host=${host}, key_len=${key.length}, secret_len=${secret.length}`);

  const auth = btoa(`${key}:${secret}`);
  const authUrls = [
    `${host}/oauth/v1/generate?grant_type=client_credentials`,
    `${host}/oauth/v1/generate/token?grant_type=client_credentials`,
  ];

  let lastFailure = "Daraja auth failed before a response was read.";

  for (const url of authUrls) {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    console.log(`Daraja auth response: url=${url}, status=${res.status}, content-type=${res.headers.get("content-type")}, content-length=${res.headers.get("content-length")}`);
    const bodyText = await res.text();

    if (!res.ok) {
      lastFailure = `Daraja auth failed (${res.status}) at ${url}: ${bodyText || "empty response"}`;
      continue;
    }

    if (!bodyText) {
      lastFailure = `Daraja auth returned empty body at ${url}`;
      continue;
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch {
      lastFailure = `Daraja auth returned non-JSON at ${url}: ${bodyText.slice(0, 200)}`;
      continue;
    }

    if (data.access_token) {
      return data.access_token;
    }

    lastFailure = `Daraja auth missing access_token at ${url}: ${bodyText.slice(0, 200)}`;
  }

  throw new Error(`${lastFailure}. Verify MPESA_CONSUMER_KEY/SECRET match the ${env} app on the Safaricom developer portal.`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let currentTransferId: string | null = null;
  let currentUserId: string | null = null;
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
    currentTransferId = transfer_id;
    currentUserId = user.id;

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

    const env = ((Deno.env.get("MPESA_ENVIRONMENT") || "sandbox").trim().toLowerCase()) as "sandbox" | "production";
    const shortcode = Deno.env.get("MPESA_SHORTCODE")?.trim();
    const initiatorName = Deno.env.get("MPESA_INITIATOR_NAME")?.trim();
    const securityCredential = Deno.env.get("MPESA_SECURITY_CREDENTIAL")?.trim();
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

    console.log(`B2C request: env=${env}, shortcode=${shortcode}, initiator=${initiatorName}, msisdn=${msisdn}, amount=${payload.Amount}`);

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
    if (currentTransferId) {
      try {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: msg.slice(0, 500),
        }).eq("id", currentTransferId);
        if (currentUserId) {
          await supabase.from("notifications").insert({
            user_id: currentUserId,
            title: "M-Pesa transfer failed",
            message: msg.slice(0, 300),
            type: "error",
          });
        }
      } catch (e) {
        console.error("Failed to mark transfer failed:", e);
      }
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
