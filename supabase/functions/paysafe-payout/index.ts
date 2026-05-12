import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAYSAFE_API_KEY = Deno.env.get("PAYSAFE_API_KEY")!;
const PAYSAFE_ACCOUNT_ID = Deno.env.get("PAYSAFE_ACCOUNT_ID")!;
const PAYSAFE_ENV = (Deno.env.get("PAYSAFE_ENV") || "test").toLowerCase();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const BASE = PAYSAFE_ENV === "live"
  ? "https://api.paysafe.com"
  : "https://api.test.paysafe.com";

function authHeader() {
  // Paysafe uses HTTP Basic with the API key (already in user:pass form)
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
    const callbackUrl = `${SUPABASE_URL}/functions/v1/paysafe-webhook`;

    let url = "";
    let body: Record<string, unknown> = {};
    let security: { question: string; answer: string } | null = null;

    if (transfer.payout_method === "interac") {
      url = `${BASE}/alternatepayments/v1/accounts/${PAYSAFE_ACCOUNT_ID}/etransfers`;
      security = transfer.interac_security_question && transfer.interac_security_answer
        ? { question: transfer.interac_security_question, answer: transfer.interac_security_answer }
        : genSecurity();
      body = {
        merchantRefNum,
        amount: amountCents,
        currencyCode: "CAD",
        recipient: {
          firstName,
          lastName,
          email: transfer.recipient_account, // email stored here for interac
        },
        notification: { recipientLanguage: "en" },
        securityQuestion: { question: security.question, answer: security.answer },
        callbackUrl,
      };
    } else if (transfer.payout_method === "eft") {
      // recipient_account is "INST-TRANSIT-ACCT"
      const [institutionId, transitNumber, accountNumber] = (transfer.recipient_account || "").split("-");
      if (!institutionId || !transitNumber || !accountNumber) {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: "Invalid Canadian bank coordinates",
        }).eq("id", transfer.id);
        return new Response(JSON.stringify({ error: "Invalid bank coordinates" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      url = `${BASE}/directdebit/v1/accounts/${PAYSAFE_ACCOUNT_ID}/standalonecredits`;
      body = {
        merchantRefNum,
        amount: amountCents,
        eft: {
          accountHolderName: transfer.recipient_name,
          institutionId,
          transitNumber,
          accountNumber,
          accountType: "CHECKING",
        },
        profile: { firstName, lastName },
        callbackUrl,
      };
    } else {
      return new Response(JSON.stringify({ error: `Unsupported payout_method ${transfer.payout_method}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);
    let resp: Response;
    let json: any = null;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authHeader(),
          "Content-Type": "application/json",
          "Simulator": PAYSAFE_ENV === "test" ? "EXTERNAL" : "INTERNAL",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      json = await resp.json().catch(() => ({}));
    } catch (e) {
      clearTimeout(timeout);
      console.error("Paysafe network error", e);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "Paysafe network/timeout error",
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: "Paysafe network error" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    clearTimeout(timeout);

    if (!resp.ok) {
      const reason = json?.error?.message || json?.errorMessage || `Paysafe HTTP ${resp.status}`;
      console.error("Paysafe error", resp.status, json);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", transfer.id);
      return new Response(JSON.stringify({ success: false, error: reason, details: json }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, unknown> = {
      status: "processing",
      provider_reference: json?.id ?? merchantRefNum,
      paysafe_payment_id: json?.id ?? null,
    };
    if (security) {
      updates.interac_security_question = security.question;
      updates.interac_security_answer = security.answer;
    }
    await supabase.from("transfers").update(updates).eq("id", transfer.id);

    return new Response(JSON.stringify({
      success: true,
      paysafe_id: json?.id ?? null,
      status: json?.status ?? "PENDING",
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
