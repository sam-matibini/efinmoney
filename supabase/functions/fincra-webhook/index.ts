import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaFincra, isFincraWalletTopUp } from "../_shared/fincra-credit.ts";
import { getFincraConfig } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, signature",
  "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
};

type SbAdmin = ReturnType<typeof createClient>;

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function reverseTransferLedger(supabase: SbAdmin, transferId: string): Promise<boolean> {
  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing && existing.length > 0) return false;
  const { data: originals } = await supabase.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (!originals?.length) return false;
  const journalId = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: journalId, account_id: o.account_id, wallet_id: o.wallet_id, currency_code: o.currency_code,
    debit_amount: o.credit_amount, credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal", reference_id: transferId,
  }));
  const { error } = await supabase.from("ledger_entries").insert(rows);
  return !error;
}

function settleAmount(data: Record<string, unknown>): number {
  for (const key of ["amountToSettle", "amountReceived", "amount", "amountExpected"]) {
    const n = Number(data[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function extractMeta(data: Record<string, unknown>): Record<string, unknown> {
  const raw = data.metadata;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(
      JSON.stringify({ ok: true, endpoint: "fincra-webhook", message: "Webhook is live. POST signed events here." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { webhookSecret } = getFincraConfig();

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("signature") || req.headers.get("Signature") || "";

    if (webhookSecret) {
      const expected = await hmacSha512Hex(webhookSecret, rawBody);
      if (!signature || signature.toLowerCase() !== expected.toLowerCase()) {
        console.warn("fincra-webhook: invalid signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else {
      console.warn("fincra-webhook: FINCRA_WEBHOOK_SECRET not set — skipping signature check");
    }

    const event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    const eventName = String(event?.event || "").toLowerCase();
    const data = (event?.data ?? {}) as Record<string, unknown>;

    if (eventName === "charge.successful") {
      const meta = extractMeta(data);
      const merchantRef = String(data.merchantReference || meta.reference || data.reference || "");
      const userId = meta.user_id ? String(meta.user_id) : "";
      if (userId && isFincraWalletTopUp(meta, merchantRef)) {
        const currency = String(data.currency || meta.currency || "").toUpperCase();
        const amount = settleAmount(data);
        const idempotencyRef = String(data.chargeReference || data.id || merchantRef);
        const walletId = meta.wallet_id ? String(meta.wallet_id) : undefined;
        await creditWalletViaFincra(
          supabase, userId, currency, amount, idempotencyRef, walletId,
          `Top-up via Fincra webhook (${merchantRef})`,
        );
      }
    }

    const payoutSuccess = eventName.includes("payout") && (eventName.includes("success") || data.status === "successful" || data.status === "success");
    const payoutFailed = eventName.includes("payout") && (eventName.includes("fail") || data.status === "failed");

    if (payoutSuccess || payoutFailed) {
      const customerRef = String(data.customerReference || data.merchantReference || "");
      const transferId = customerRef.startsWith("EFM-") ? null : customerRef;
      let tid = transferId;
      if (!tid && customerRef) {
        const { data: tr } = await supabase.from("transfers").select("id")
          .eq("provider_reference", String(data.reference || data.id || "")).maybeSingle();
        tid = tr?.id as string | undefined;
      }
      if (!tid && customerRef) {
        const { data: tr2 } = await supabase.from("transfers").select("id").eq("id", customerRef).maybeSingle();
        tid = tr2?.id as string | undefined;
      }

      if (tid) {
        if (payoutSuccess) {
          await supabase.from("transfers").update({
            status: "completed",
            provider_reference: String(data.reference || data.id || customerRef),
          }).eq("id", tid);
          const { data: tr } = await supabase.from("transfers").select("sender_id, recipient_name, target_currency, target_amount").eq("id", tid).maybeSingle();
          if (tr?.sender_id) {
            await supabase.from("notifications").insert({
              user_id: tr.sender_id,
              title: "Transfer delivered",
              message: `Your ${tr.target_currency} ${tr.target_amount} transfer to ${tr.recipient_name} was completed.`,
              type: "transfer",
            });
          }
        } else if (payoutFailed) {
          const reason = String(data.message || data.reason || data.failureReason || "Payout failed");
          const reversed = await reverseTransferLedger(supabase, tid);
          await supabase.from("transfers").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", tid);
          const { data: tr } = await supabase.from("transfers").select("sender_id, recipient_name").eq("id", tid).maybeSingle();
          if (tr?.sender_id) {
            await supabase.from("notifications").insert({
              user_id: tr.sender_id,
              title: "Transfer failed — refunded",
              message: reversed
                ? `Your transfer to ${tr.recipient_name} could not be completed. Funds returned to your wallet.`
                : `Your transfer to ${tr.recipient_name} could not be completed.`,
              type: "error",
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("fincra-webhook error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Webhook error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
