import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYSAFE_API_KEY = Deno.env.get("PAYSAFE_API_KEY")!;
const PAYSAFE_ENV = (Deno.env.get("PAYSAFE_ENV") || "test").toLowerCase();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const BASE = PAYSAFE_ENV === "live"
  ? "https://api.paysafe.com"
  : "https://api.test.paysafe.com";

function authHeader() {
  // Paysafe HTTP Basic with the API key (already in user:pass form)
  const b64 = btoa(PAYSAFE_API_KEY);
  return `Basic ${b64}`;
}

function splitName(full: string) {
  const parts = (full || "").trim().split(/\s+/);
  const firstName = parts.shift() || "Recipient";
  const lastName = parts.join(" ") || firstName;
  return { firstName, lastName };
}

function genSecurity() {
  const q = "What is the secret code I sent you?";
  const a = (Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 4)).toLowerCase();
  return { question: q, answer: a };
}

async function paysafePost(path: string, body: unknown, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function extractError(json: any, status: number) {
  const code = json?.error?.code;
  const msg = json?.error?.message || json?.errorMessage || `Paysafe HTTP ${status}`;
  const detail = Array.isArray(json?.error?.details) ? json.error.details.join("; ") : "";

  // Friendly mapping for known account-configuration errors
  const lower = `${msg} ${detail}`.toLowerCase();
  if (code === "PAYMENTHUB-1" || lower.includes("payment type and currency code combination")) {
    return "This payout corridor is not yet enabled on our payments provider. Your funds have been returned to your wallet. Please try again later or contact support.";
  }
  if (code === "2008" || code === 2008 || lower.includes("routing number") || lower.includes("invalid institution") || lower.includes("invalid transit")) {
    return "Invalid Canadian Bank details. Please check your Institution and Transit numbers.";
  }

  return code ? `${msg} (code ${code})${detail ? ` — ${detail}` : ""}` : msg;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { transfer_id } = await req.json();
    if (!transfer_id) {
      return new Response(JSON.stringify({ error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).single();
    if (tErr || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (transfer.recipient_country !== "CA" || transfer.target_currency !== "CAD") {
      return new Response(JSON.stringify({ error: "Paysafe payout only supports CAD/CA" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const merchantRefNum = `EFM-${transfer.id}`;
    const amountCents = Math.round(Number(transfer.target_amount) * 100);
    const { firstName, lastName } = splitName(transfer.recipient_name);

    // Fetch sender profile for billingDetails (Paysafe requires it on the payment handle)
    const { data: profile } = await supabase
      .from("profiles")
      .select("street_address, city, state, postal_code, address_country, country")
      .eq("id", transfer.user_id)
      .maybeSingle();

    const billingDetails = {
      street: profile?.street_address || "1 King St W",
      city: profile?.city || "Toronto",
      state: profile?.state || "ON",
      country: profile?.address_country || profile?.country || "CA",
      zip: (profile?.postal_code || "M5H1A1").replace(/\s+/g, "").toUpperCase(),
    };

    // ---------- Step 1: Create Payment Handle ----------
    let handleBody: Record<string, unknown> = {};
    let security: { question: string; answer: string } | null = null;

    if (transfer.payout_method === "interac") {
      security = transfer.interac_security_question && transfer.interac_security_answer
        ? { question: transfer.interac_security_question, answer: transfer.interac_security_answer }
        : genSecurity();
      handleBody = {
        merchantRefNum: `${merchantRefNum}-PH`,
        transactionType: "STANDALONE_CREDIT",
        paymentType: "INTERAC_ETRANSFER",
        amount: amountCents,
        currencyCode: "CAD",
        interacETransfer: {
          consumerId: transfer.recipient_account, // email
          consumerIdType: "EMAIL",
          recipientName: transfer.recipient_name,
          securityQuestion: { question: security.question, answer: security.answer },
        },
        profile: { firstName, lastName },
        billingDetails,
      };
    } else if (transfer.payout_method === "eft") {
      const rawParts = (transfer.recipient_account || "").split("-");
      const rawInstitution = (rawParts[0] || "").replace(/\D/g, "");
      const rawTransit = (rawParts[1] || "").replace(/\D/g, "");
      const accountNumber = String(rawParts[2] || "").replace(/\D/g, "");
      if (!rawInstitution || !rawTransit || !accountNumber) {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: "Invalid Canadian Bank details. Please check your Institution and Transit numbers.",
        }).eq("id", transfer.id);
        return new Response(JSON.stringify({ error: "Invalid Canadian Bank details. Please check your Institution and Transit numbers." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const institutionId = rawInstitution.padStart(3, "0");
      const transitNumber = rawTransit.padStart(5, "0");
      // Canadian 9-digit clearing code: '0' + 3-digit institution + 5-digit transit
      const clearingCode = `0${institutionId}${transitNumber}`;
      handleBody = {
        merchantRefNum: `${merchantRefNum}-PH`,
        transactionType: "STANDALONE_CREDIT",
        paymentType: "EFT",
        amount: amountCents,
        currencyCode: "CAD",
        eft: {
          accountHolderName: transfer.recipient_name,
          institutionId,
          transitNumber,
          routingNumber: clearingCode,
          accountNumber: String(accountNumber),
          accountType: "CHECKING",
        },
        profile: { firstName, lastName },
        billingDetails,
      };
    } else {
      return new Response(JSON.stringify({ error: `Unsupported payout_method ${transfer.payout_method}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let handleResp: { ok: boolean; status: number; json: any };
    try {
      handleResp = await paysafePost("/paymenthub/v1/paymenthandles", handleBody);
    } catch (e) {
      console.error("Paysafe payment-handle network error", e);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "Paysafe network/timeout error",
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: "Paysafe network error" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!handleResp.ok) {
      const reason = extractError(handleResp.json, handleResp.status);
      console.error("Paysafe payment-handle error", handleResp.status, handleResp.json);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: reason, details: handleResp.json }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const handleStatus: string = handleResp.json?.status;
    const paymentHandleToken: string | undefined = handleResp.json?.paymentHandleToken;

    if (handleStatus !== "PAYABLE" || !paymentHandleToken) {
      const reason = `Payment handle not payable (status ${handleStatus || "unknown"})`;
      console.error("Paysafe payment-handle not payable", handleResp.json);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: reason, details: handleResp.json }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- Step 2: Submit standalone credit ----------
    const creditBody = {
      merchantRefNum,
      amount: amountCents,
      currencyCode: "CAD",
      paymentHandleToken,
    };

    let creditResp: { ok: boolean; status: number; json: any };
    try {
      creditResp = await paysafePost("/paymenthub/v1/standalonecredits", creditBody);
    } catch (e) {
      console.error("Paysafe standalone-credit network error", e);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "Paysafe network/timeout error",
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: "Paysafe network error" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!creditResp.ok) {
      const reason = extractError(creditResp.json, creditResp.status);
      console.error("Paysafe standalone-credit error", creditResp.status, creditResp.json);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: reason, details: creditResp.json }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, unknown> = {
      status: "processing",
      provider_reference: creditResp.json?.id ?? merchantRefNum,
      paysafe_payment_id: creditResp.json?.id ?? null,
    };
    if (security) {
      updates.interac_security_question = security.question;
      updates.interac_security_answer = security.answer;
    }
    await supabase.from("transfers").update(updates).eq("id", transfer.id);

    return new Response(JSON.stringify({
      success: true,
      paysafe_id: creditResp.json?.id ?? null,
      status: creditResp.json?.status ?? "PENDING",
      security: security ? { question: security.question, answer: security.answer } : null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paysafe-payout error", err);
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unknown" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
