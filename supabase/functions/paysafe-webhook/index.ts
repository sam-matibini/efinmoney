import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mapPaysafeCreditStatus } from "../_shared/paysafe-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, paysafe-signature, x-paysafe-signature, x-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const WEBHOOK_SECRET = Deno.env.get("PAYSAFE_WEBHOOK_SECRET") || "";

// HMAC-SHA256 signature verifier. Fail-closed: rejects when secret missing,
// signature header missing, or verification errors.
async function verifyPaysafeSignature(rawBody: string, sigHeader: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) {
    console.error("PAYSAFE_WEBHOOK_SECRET not configured");
    return false;
  }
  if (!sigHeader) return false;
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const bytes = new Uint8Array(mac);
    // Paysafe Payment Hub: signature = base64(HMAC-SHA256(secret, raw JSON body))
    const b64 = btoa(String.fromCharCode(...bytes));
    const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const provided = sigHeader.replace(/^sha256=/i, "").trim();
    return provided === b64 || provided.toLowerCase() === hex.toLowerCase();
  } catch (e) {
    console.error("Paysafe signature verification error", e);
    return false;
  }
}

function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Test connectivity (GET)
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "Paysafe webhook endpoint is active" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let raw = "";
  let event: any = {};
  try {
    raw = await req.text();
    event = raw ? JSON.parse(raw) : {};
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sig = req.headers.get("Signature")
    || req.headers.get("signature")
    || req.headers.get("paysafe-signature")
    || req.headers.get("x-paysafe-signature")
    || req.headers.get("x-signature");
  const sigOk = await verifyPaysafeSignature(raw, sig);
  if (!sigOk) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = event?.payload && typeof event.payload === "object" ? event.payload : event;

  const eventType = String(pick(event, "eventType", "eventName", "type") || pick(payload, "eventType", "eventName") || "unknown");
  const eventId = pick(event, "id", "eventId") || pick(payload, "id", "eventId");
  const accountId = pick(event, "accountId") || pick(payload, "accountId");
  const merchantRefNum = pick(event, "merchantRefNum") || pick(payload, "merchantRefNum");
  const paymentHandleToken = pick(event, "paymentHandleToken") || pick(payload, "paymentHandleToken");
  const paymentId = pick(event, "paymentId") || pick(payload, "paymentId") || pick(payload, "id");
  const status = (pick(event, "status") || pick(payload, "status") || "").toString().toUpperCase() || null;
  const amountRaw = pick(event, "amount") ?? pick(payload, "amount");
  const amount = amountRaw != null ? Number(amountRaw) : null;
  const currencyCode = pick(event, "currencyCode") || pick(payload, "currencyCode");

  // 1) Always log the webhook
  let logId: string | null = null;
  try {
    const { data: log } = await supabase.from("paysafe_webhook_logs").insert({
      event_type: eventType,
      event_id: eventId ? String(eventId) : null,
      account_id: accountId ? String(accountId) : null,
      merchant_ref_num: merchantRefNum ? String(merchantRefNum) : null,
      payment_handle_token: paymentHandleToken ? String(paymentHandleToken) : null,
      payment_id: paymentId ? String(paymentId) : null,
      status,
      amount: Number.isFinite(amount as number) ? amount : null,
      currency_code: currencyCode ? String(currencyCode) : null,
      raw_payload: event,
      processed: false,
      processing_error: !sigOk ? "signature_mismatch" : null,
    }).select("id").single();
    logId = log?.id ?? null;
  } catch (e) {
    console.error("paysafe-webhook: log insert failed", e);
  }

  // 2) Try to update the matching transfer record
  try {
    const refStr = merchantRefNum ? String(merchantRefNum) : "";
    let transferId = refStr.startsWith("EFM-") ? refStr.slice(4) : null;

    if (!transferId && paymentId) {
      const { data: byPaysafeId } = await supabase
        .from("transfers")
        .select("id")
        .eq("paysafe_payment_id", String(paymentId))
        .maybeSingle();
      transferId = byPaysafeId?.id ?? null;
    }

    const newStatus = mapPaysafeCreditStatus(status || "", eventType);
    let failure: string | null = null;
    if (newStatus === "failed") {
      failure = `Paysafe: ${eventType} ${status || ""}`.trim();
    } else if (newStatus === "processing") {
      // keep existing failure_reason untouched
    }

    if (transferId && newStatus) {
      const { data: existing } = await supabase
        .from("transfers")
        .select("status")
        .eq("id", transferId)
        .maybeSingle();

      const update: Record<string, unknown> = { status: newStatus };
      if (failure) update.failure_reason = failure;
      if (paymentId) update.paysafe_payment_id = String(paymentId);
      if (newStatus === "completed") update.completed_at = new Date().toISOString();

      if (existing?.status !== newStatus) {
        await supabase.from("transfers").update(update).eq("id", transferId);
      }

      // Refund wallet on failure OR reversal (Interac cancelled/expired/returned).
      // Skip for payment-link claims — funds are in escrow (2199), not the sender wallet.
      if (existing?.status !== newStatus && (newStatus === "failed" || newStatus === "reversed")) {
        const { data: plink } = await supabase
          .from("payment_link_payouts")
          .select("id")
          .eq("transfer_id", transferId)
          .maybeSingle();
        if (plink) {
          console.log("paysafe-webhook: skipping wallet refund for payment-link transfer", transferId);
        } else {
        const { data: t } = await supabase.from("transfers").select("*").eq("id", transferId).single();
        if (t && t.funding_source === "wallet") {
          const refType = newStatus === "reversed" ? "transfer_reversal" : "transfer_refund";
          // Idempotency: don't double-refund/reverse
          const { data: existing } = await supabase.from("ledger_entries").select("id")
            .in("reference_type", ["transfer_refund", "transfer_reversal"])
            .eq("reference_id", transferId).limit(1);
          if (!existing || existing.length === 0) {
            const { data: liabAcc } = await supabase
              .from("ledger_accounts").select("id").like("code", "21%")
              .eq("currency_code", t.source_currency).limit(1).maybeSingle();
            if (liabAcc) {
              const journalId = crypto.randomUUID();
              await supabase.from("ledger_entries").insert([{
                journal_id: journalId,
                account_id: liabAcc.id,
                wallet_id: t.sender_wallet_id,
                currency_code: t.source_currency,
                debit_amount: 0,
                credit_amount: Number(t.source_amount) + Number(t.fee_amount || 0),
                description: newStatus === "reversed"
                  ? `Reversal (Paysafe ${eventType}) for transfer ${transferId}`
                  : `Refund (Paysafe failure) for transfer ${transferId}`,
                reference_type: refType,
                reference_id: transferId,
                created_by: t.sender_id,
              }]);
            }
          }
        }
        }
      }
    }

    if (logId) {
      await supabase.from("paysafe_webhook_logs").update({ processed: true }).eq("id", logId);
    }
  } catch (e) {
    console.error("paysafe-webhook: processing failed", e);
    if (logId) {
      await supabase.from("paysafe_webhook_logs").update({
        processed: false,
        processing_error: e instanceof Error ? e.message : "unknown",
      }).eq("id", logId);
    }
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ received: true, message: "Paysafe webhook received successfully" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
