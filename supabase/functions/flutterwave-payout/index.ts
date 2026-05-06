import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PayoutRequest {
  transfer_id: string;
  phone_number: string;
  amount: number;
  currency: string; // KES, UGX, TZS, GHS, ZMW, RWF, NGN
  network: string;  // mpesa, mtn, airtel, vodafone, tigo
  recipient_name: string;
}

// Map (currency, network) -> Flutterwave account_bank code
// See: https://developer.flutterwave.com/docs/mobile-money
const NETWORK_MAP: Record<string, string> = {
  "KES:mpesa": "MPS",
  "UGX:mtn": "MTN",
  "UGX:airtel": "ATL",
  "TZS:airtel": "AIRTEL",
  "TZS:vodafone": "VODAFONE",
  "TZS:tigo": "TIGO",
  "GHS:mtn": "MTN",
  "GHS:airtel": "ATL",
  "GHS:vodafone": "VOD",
  "ZMW:mtn": "MTN",
  "ZMW:airtel": "AIRTEL",
  "RWF:mtn": "MTN",
  "RWF:airtel": "AIRTEL",
};

function fxBeneficiaryType(currency: string): string {
  return currency === "NGN" ? "bank" : "mobilemoney";
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: PayoutRequest = await req.json();
    const { transfer_id, phone_number, amount, currency, network, recipient_name } = body;
    currentTransferId = transfer_id;
    currentUserId = user.id;

    if (!transfer_id || !phone_number || !amount || amount <= 0 || !currency || !network) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
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

    const flwSecret = (Deno.env.get("FLW_SECRET_KEY") || "").trim();
    if (!flwSecret) {
      // Stub mode if not configured
      await supabase.from("transfers").update({
        status: "processing",
        provider_reference: `STUB-${transfer_id.slice(0, 8)}`,
      }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Transfer queued",
        message: `Your ${currency} ${amount} transfer to ${recipient_name} is queued (Flutterwave not yet configured).`,
        type: "info",
      });
      return new Response(JSON.stringify({ success: true, stub: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const networkKey = `${currency}:${network.toLowerCase()}`;
    const accountBank = NETWORK_MAP[networkKey];
    if (!accountBank && currency !== "NGN") {
      const reason = `Unsupported network ${network} for ${currency}`;
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: user.id, title: "Transfer failed", message: reason, type: "error",
      });
      return new Response(JSON.stringify({ success: false, error: reason }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = `EFM-${transfer_id.slice(0, 8)}-${Date.now()}`;
    const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
    const callbackUrl = `https://${projectRef}.functions.supabase.co/flutterwave-webhook`;

    const payload: Record<string, unknown> = {
      account_bank: accountBank || "MPS",
      account_number: normalizePhone(phone_number),
      amount: Math.round(amount * 100) / 100,
      narration: `Transfer to ${recipient_name}`,
      currency,
      reference,
      callback_url: callbackUrl,
      debit_currency: currency,
      beneficiary_name: recipient_name,
      meta: [
        { transfer_id, network, beneficiary_type: fxBeneficiaryType(currency) },
      ],
    };

    console.log("Flutterwave transfer request:", JSON.stringify(payload));

    const res = await fetch("https://api.flutterwave.com/v3/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flwSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await res.json();
    console.log("Flutterwave response:", res.status, JSON.stringify(result));

    if (!res.ok || result.status !== "success") {
      const reason = result?.message || `HTTP ${res.status}`;
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: user.id,
        title: "Transfer failed",
        message: reason,
        type: "error",
      });
      return new Response(JSON.stringify({ success: false, error: reason }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: String(result.data?.id || result.data?.reference || reference),
    }).eq("id", transfer_id);

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Transfer initiated",
      message: `Your ${currency} ${amount} transfer to ${recipient_name} is being processed.`,
      type: "transfer",
    });

    return new Response(JSON.stringify({
      success: true,
      reference,
      flw_id: result.data?.id,
      response: result,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flutterwave-payout error:", err);
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
            title: "Transfer failed",
            message: msg.slice(0, 300),
            type: "error",
          });
        }
      } catch (_) { /* ignore */ }
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
