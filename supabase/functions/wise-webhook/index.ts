/**
 * Wise Platform webhook receiver.
 * URL: https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/wise-webhook
 *
 * balances#credit / balances#update (credit) → match wise_topup_intents → credit wallet.
 * transfers#state-change → update matching transfers by provider_reference.
 *
 * WISE_WEBHOOK_ENV=sandbox → sandbox public key (default: production).
 * WISE_SKIP_SIGNATURE=true → local debug only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaWise } from "../_shared/wise-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-signature-sha256, X-Signature-SHA256",
  "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
};

const WISE_PROD_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvO8vXV+JksBzZAY6GhSO
XdoTCfhXaaiZ+qAbtaDBiu2AGkGVpmEygFmWP4Li9m5+Ni85BhVvZOodM9epgW3F
bA5Q1SexvAF1PPjX4JpMstak/QhAgl1qMSqEevL8cmUeTgcMuVWCJmlge9h7B1CS
D4rtlimGZozG39rUBDg6Qt2K+P4wBfLblL0k4C4YUdLnpGYEDIth+i8XsRpFlogx
CAFyH9+knYsDbR43UJ9shtc42Ybd40Afihj8KnYKXzchyQ42aC8aZ/h5hyZ28yVy
Oj3Vos0VdBIs/gAyJ/4yyQFCXYte64I7ssrlbGRaco4nKF3HmaNhxwyKyJafz19e
HwIDAQAB
-----END PUBLIC KEY-----`;

const WISE_SANDBOX_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwpb91cEYuyJNQepZAVfP
ZIlPZfNUefH+n6w9SW3fykqKu938cR7WadQv87oF2VuT+fDt7kqeRziTmPSUhqPU
ys/V2Q1rlfJuXbE+Gga37t7zwd0egQ+KyOEHQOpcTwKmtZ81ieGHynAQzsn1We3j
wt760MsCPJ7GMT141ByQM+yW1Bx+4SG3IGjXWyqOWrcXsxAvIXkpUD/jK/L958Cg
nZEgz0BSEh0QxYLITnW1lLokSx/dTianWPFEhMC9BgijempgNXHNfcVirg1lPSyg
z7KqoKUN0oHqWLr2U1A+7kqrl6O2nx3CKs1bj1hToT1+p4kcMoHXA7kA+VBLUpEs
VwIDAQAB
-----END PUBLIC KEY-----`;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function b64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function verifyWiseSignature(rawBody: string, signatureB64: string, useSandbox: boolean): Promise<boolean> {
  if (!signatureB64) return false;
  try {
    const pem = useSandbox ? WISE_SANDBOX_PUBLIC_KEY : WISE_PROD_PUBLIC_KEY;
    const key = await crypto.subtle.importKey(
      "spki",
      pemToArrayBuffer(pem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64ToArrayBuffer(signatureB64),
      new TextEncoder().encode(rawBody),
    );
  } catch (e) {
    console.error("wise-webhook: signature verify error", e);
    return false;
  }
}

function mapWiseStateToStatus(state: string): string | null {
  const s = state.toUpperCase();
  if (["OUTGOING_PAYMENT_SENT", "FUNDS_CONVERTED", "COMPLETED", "DONE"].includes(s)) return "completed";
  if (["BOUNCED_BACK", "CANCELLED", "CANCELED", "CHARGED_BACK"].includes(s)) return "failed";
  if (["PROCESSING", "INCOMING_PAYMENT_WAITING", "WAITING_RECIPIENT_INPUT_TO_PROCEED", "FUNDS_REFUNDED"].includes(s)) {
    return "processing";
  }
  return null;
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? v as Record<string, unknown> : {};
}

function extractRefNeedle(raw: string): string | null {
  const m = raw.match(/efm-wise-[a-z0-9]+-\d+/i);
  return m?.[0] || null;
}

/** Interac e-Transfer intents use their own reference prefix. */
function extractInteracRefNeedle(raw: string): string | null {
  const m = raw.match(/efm-interac-[a-z0-9]+-\d+/i);
  return m?.[0] || null;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(
      JSON.stringify({
        ok: true,
        endpoint: "wise-webhook",
        message: "Webhook is live. POST Wise signed events here.",
        handles: ["balances#credit", "balances#update", "transfers#state-change"],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signature =
    req.headers.get("X-Signature-SHA256") ||
    req.headers.get("x-signature-sha256") ||
    "";

  const skipSig = Deno.env.get("WISE_SKIP_SIGNATURE") === "true";
  const useSandbox = (Deno.env.get("WISE_WEBHOOK_ENV") || "production").toLowerCase() === "sandbox";

  if (!skipSig) {
    const valid = await verifyWiseSignature(rawBody, signature, useSandbox);
    if (!valid) {
      console.warn("wise-webhook: invalid signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.warn("wise-webhook: WISE_SKIP_SIGNATURE=true — skipping signature check");
  }

  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = String(event.event_type || event.event || event.trigger_on || "unknown");
  const data = asObj(event.data && typeof event.data === "object" ? event.data : event);
  const resource = asObj(data.resource && typeof data.resource === "object" ? data.resource : data);

  const amount = Number(data.amount);
  const currency = String(data.currency || "").toUpperCase() || null;
  const transactionType = String(data.transaction_type || data.transactionType || "").toLowerCase() || null;
  const balanceId = String(data.balance_id || resource.id || "");
  const profileId = String(resource.profile_id || data.profile_id || "");
  const occurredAt = String(data.occurred_at || data.occurredAt || event.sent_at || "") || null;
  const postBalance = Number(data.post_transaction_balance_amount ?? data.post_transaction_balance);
  const transferReference = String(data.transfer_reference || data.transferReference || "") || null;
  const subscriptionId = String(event.subscription_id || "") || null;

  const wiseTransferId = String(
    resource.id && eventType.includes("transfer")
      ? resource.id
      : data.transfer_id || data.transferId || "",
  );
  const currentState = String(
    data.current_state || data.currentState || resource.status || data.status || "",
  );

  console.log("wise-webhook event", {
    eventType,
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    transactionType,
    balanceId: balanceId || null,
    profileId: profileId || null,
    wiseTransferId: wiseTransferId || null,
    currentState: currentState || null,
    transferReference,
    occurredAt,
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    await supabase.from("provider_webhook_logs").insert({
      provider: "wise",
      event_type: eventType,
      external_id: balanceId || wiseTransferId || subscriptionId || null,
      payload: event,
      received_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("wise-webhook: provider_webhook_logs insert failed", e);
  }

  const isBalanceEvent =
    eventType === "balances#credit" ||
    eventType === "balances#update" ||
    eventType.includes("balances");
  const isCredit =
    eventType === "balances#credit" ||
    transactionType === "credit" ||
    (isBalanceEvent && Number.isFinite(amount) && amount > 0 && transactionType !== "debit");

  if (isBalanceEvent && Number.isFinite(amount) && amount !== 0 && currency) {
    const txType = transactionType || (eventType === "balances#credit" ? "credit" : "unknown");
    const idempotencyKey = [
      "wise",
      eventType,
      balanceId || "nobid",
      currency,
      String(amount),
      occurredAt || String(event.sent_at || ""),
      transferReference || "",
    ].join(":");

    const { error: balErr } = await supabase.from("wise_balance_events").upsert({
      event_type: eventType,
      subscription_id: subscriptionId,
      profile_id: profileId || null,
      balance_id: balanceId || null,
      transaction_type: txType,
      amount,
      currency,
      post_balance: Number.isFinite(postBalance) ? postBalance : null,
      occurred_at: occurredAt,
      transfer_reference: transferReference,
      payload: event,
      idempotency_key: idempotencyKey,
      processed_at: new Date().toISOString(),
    }, { onConflict: "idempotency_key", ignoreDuplicates: true });

    if (balErr) {
      console.warn("wise-webhook: wise_balance_events upsert failed", balErr);
    }

    if (isCredit && amount > 0) {
      const nowIso = new Date().toISOString();
      const haystack = `${transferReference || ""} ${rawBody}`.toLowerCase();
      const digits = haystack.replace(/[^\d]/g, "");
      const needle = extractRefNeedle(haystack) || extractRefNeedle(transferReference || "");
      const interacNeedle =
        extractInteracRefNeedle(haystack) || extractInteracRefNeedle(transferReference || "");

      let intent: {
        id: string;
        user_id: string;
        wallet_id: string;
        amount: number;
        currency_code: string;
        reference: string;
        transfer_id?: string | null;
        sender_email?: string | null;
        sender_phone?: string | null;
      } | null = null;
      let intentTable: "wise_topup_intents" | "fincra_cad_interac_intents" = "wise_topup_intents";
      let matchTier: string | null = null;
      let interacAmbiguous = 0;


      if (needle) {
        const { data } = await supabase
          .from("wise_topup_intents")
          .select("id, user_id, wallet_id, amount, currency_code, reference")
          .eq("reference", needle)
          .eq("status", "pending")
          .gt("expires_at", nowIso)
          .maybeSingle();
        intent = data;
      }

      // Interac tier 1: reference + amount + currency (exact)
      if (!intent && interacNeedle) {
        const { data } = await supabase
          .from("fincra_cad_interac_intents")
          .select(INTERAC_COLS)
          .ilike("reference", interacNeedle)
          .in("status", INTERAC_OPEN)
          .gt("expires_at", nowIso)
          .maybeSingle();
        const expected = Number(data?.amount);
        if (
          data && String(data.currency_code).toUpperCase() === currency &&
          Number.isFinite(expected) && Math.abs(expected - amount) < 0.02
        ) {
          intent = data;
          intentTable = "fincra_cad_interac_intents";
          matchTier = "tier1_reference";
        }
      }


      if (!intent) {
        const { data: candidates } = await supabase
          .from("wise_topup_intents")
          .select("id, user_id, wallet_id, amount, currency_code, reference")
          .eq("status", "pending")
          .eq("currency_code", currency)
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: true })
          .limit(30);
        intent = (candidates ?? []).find((row) => {
          const expected = Number(row.amount);
          return Number.isFinite(expected) && Math.abs(expected - amount) < 0.02;
        }) ?? null;
      }

      // Interac tiers 2 & 3: contact match, then a single amount match inside the validity window
      if (!intent && currency === "CAD") {
        const { data: interacCandidates } = await supabase
          .from("fincra_cad_interac_intents")
          .select(INTERAC_COLS)
          .in("status", INTERAC_OPEN)
          .eq("currency_code", "CAD")
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: true })
          .limit(50);

        const sameAmount = (interacCandidates ?? []).filter((row) => {
          const expected = Number(row.amount);
          return Number.isFinite(expected) && Math.abs(expected - amount) < 0.02;
        });

        const contactMatches = sameAmount.filter((row) => {
          const email = String(row.sender_email || "").toLowerCase();
          const phone = String(row.sender_phone || "").replace(/[^\d]/g, "").slice(-10);
          return (email && haystack.includes(email)) || (phone && digits.includes(phone));
        });

        if (contactMatches.length === 1) {
          intent = contactMatches[0];
          intentTable = "fincra_cad_interac_intents";
          matchTier = "tier2_contact";
        } else if (contactMatches.length > 1) {
          interacAmbiguous = contactMatches.length;
        } else if (sameAmount.length === 1) {
          intent = sameAmount[0];
          intentTable = "fincra_cad_interac_intents";
          matchTier = "tier3_window";
        } else if (sameAmount.length > 1) {
          interacAmbiguous = sameAmount.length;
        }

        if (!intent && interacAmbiguous > 1) {
          await supabase.from("admin_notifications").insert({
            title: "Interac deposit needs manual allocation",
            message:
              `CAD ${amount} arrived but ${interacAmbiguous} open Interac payments match. Allocate manually. Wise txn ${idempotencyKey}.`,
            type: "treasury",
          }).catch(() => {/* ignore */});
        }
      }


      if (intent) {
        const isInterac = intentTable === "fincra_cad_interac_intents";
        try {
          const creditIdem = `wise-intent-${intent.id}-${idempotencyKey}`;
          const result = await creditWalletViaWise(
            supabase,
            intent.user_id,
            intent.currency_code,
            Number(intent.amount),
            creditIdem,
            intent.wallet_id,
            isInterac
              ? `Interac e-Transfer top-up (${intent.reference})`
              : `Wise top-up (${intent.reference})`,
          );
          await supabase.from(intentTable).update(
            isInterac
              ? {
                status: "settled",
                provider_reference: transferReference || balanceId || idempotencyKey,
                credited_at: nowIso,
                received_at: nowIso,
                matched_at: nowIso,
                confirmed_at: nowIso,
                match_tier: matchTier,
                wise_transaction_id: idempotencyKey,
              }
              : {
                status: "completed",
                provider_reference: transferReference || balanceId || idempotencyKey,
                credited_at: nowIso,
              },
          ).eq("id", intent.id).in("status", ["pending", "awaiting_payment"]);

          console.log("wise-webhook: credited intent", intentTable, intent.id, result);

          // Interac-funded sends: release the linked payout now that funds arrived
          if (isInterac && intent.transfer_id) {
            try {
              const res = await fetch(
                `${Deno.env.get("SUPABASE_URL")}/functions/v1/execute-transfer`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
                    "x-idempotency-key": creditIdem,
                  },
                  body: JSON.stringify({ transfer_id: intent.transfer_id }),
                },
              );
              const payoutBody = await res.text();
              if (!res.ok) {
                console.error(`wise-webhook: execute-transfer failed [${res.status}]: ${payoutBody}`);
                await supabase.from("transfers").update({
                  status: "failed",
                  failure_reason: payoutBody.slice(0, 500),
                }).eq("id", intent.transfer_id);
              } else {
                console.log("wise-webhook: released Interac-funded transfer", intent.transfer_id, payoutBody.slice(0, 300));
              }
            } catch (payoutErr) {
              console.error("wise-webhook: execute-transfer threw", payoutErr);
            }
          }

        } catch (creditErr) {
          console.error("wise-webhook: credit failed", creditErr);
          await supabase.from("admin_notifications").insert({
            title: "Wise top-up credit failed",
            message: `Intent ${intent.reference}: ${creditErr instanceof Error ? creditErr.message : String(creditErr)}`,
            type: "treasury",
          }).catch(() => {/* ignore */});
        }
      } else if (txType === "credit" || eventType === "balances#credit") {
        await supabase.from("admin_notifications").insert({
          title: "Wise balance credited (unmatched)",
          message: `${currency} ${amount} deposited — no pending top-up intent matched. Balance ${balanceId || "(unknown)"}.`,
          type: "treasury",
        }).catch(() => {/* ignore */});
      }
    }
  }

  if (wiseTransferId && (eventType.includes("transfer") || currentState)) {
    const mapped = mapWiseStateToStatus(currentState);
    if (mapped) {
      const { data: byRef } = await supabase
        .from("transfers")
        .select("id, status")
        .or(`provider_reference.eq.${wiseTransferId},provider_charge_id.eq.${wiseTransferId}`)
        .limit(1)
        .maybeSingle();

      if (byRef?.id) {
        const patch: Record<string, unknown> = {
          status: mapped,
          updated_at: new Date().toISOString(),
        };
        if (mapped === "failed") {
          patch.failure_reason = `Wise state: ${currentState}`;
        }
        if (mapped === "completed") {
          patch.completed_at = new Date().toISOString();
        }
        await supabase.from("transfers").update(patch).eq("id", byRef.id);
        console.log("wise-webhook: updated transfer", byRef.id, mapped);
      }
    }
  }

  return new Response(JSON.stringify({
    received: true,
    event_type: eventType,
    amount: Number.isFinite(amount) ? amount : null,
    currency,
    transaction_type: transactionType,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
