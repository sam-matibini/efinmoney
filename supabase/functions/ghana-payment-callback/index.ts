import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGhanaPayConfig } from "../_shared/ghana-pay.ts";
import { sendTopupEmail } from "../_shared/topup-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, signature",
  "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
};

function isSuccessPayload(payload: Record<string, unknown>, data: Record<string, unknown>): boolean {
  const code = String(data.response_code ?? payload.response_code ?? "");
  const msg = String(data.response_message ?? payload.response_message ?? data.status ?? payload.status ?? "").toLowerCase();
  if (code === "202" || msg.includes("successfully received")) return true;
  return isSuccessStatus(data.status ?? payload.status);
}

function isFailureStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["failed", "failure", "declined", "rejected", "cancelled", "canceled"].includes(s);
}

function isSuccessStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["success", "successful", "completed", "approved", "paid"].includes(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" || req.method === "HEAD") {
    return new Response(
      JSON.stringify({ ok: true, endpoint: "ghana-payment-callback" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const rawBody = await req.text();
    const { webhookSecret } = getGhanaPayConfig();
    const signature = req.headers.get("signature") || req.headers.get("Signature") || "";

    if (webhookSecret && signature && signature !== webhookSecret) {
      console.warn("ghana-payment-callback: invalid signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const data = (payload.data && typeof payload.data === "object") ? payload.data : payload;

    const reference = String(data.reference || payload.reference || "").trim();
    const transactionId = String(data.transaction_id || payload.transaction_id || "").trim();
    const statusRaw = data.status ?? payload.status ?? data.transaction_status ?? payload.event;

    const isSuccess = isSuccessPayload(payload, data)
      || String(payload.event || "").toLowerCase().includes("success");
    const isFailure = isFailureStatus(statusRaw) || String(payload.event || "").toLowerCase().includes("fail");

    const findTxn = async () => {
      if (reference) {
        const r = await supabase.from("ghana_pay_transactions").select("*").eq("reference", reference).maybeSingle();
        if (r.data) return r.data;
      }
      if (transactionId) {
        const r = await supabase.from("ghana_pay_transactions").select("*").eq("transaction_id", transactionId).maybeSingle();
        if (r.data) return r.data;
      }
      return null;
    };

    const txn = await findTxn();
    if (!txn) {
      return new Response(JSON.stringify({ received: true, matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (txn.status === "completed") {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("ghana_pay_transactions").update({ last_event: payload }).eq("id", txn.id);

    if (isFailure) {
      const reason = String(data.message || data.reason || "Payment failed");
      await supabase.from("ghana_pay_transactions").update({
        status: "failed",
        failure_reason: reason,
      }).eq("id", txn.id);

      if (txn.direction === "payout" && txn.transfer_id) {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: reason.slice(0, 500),
        }).eq("id", txn.transfer_id);
      }

      return new Response(JSON.stringify({ received: true, outcome: "failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isSuccess) {
      return new Response(JSON.stringify({ received: true, outcome: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Collection: credit GHS wallet ----
    if (txn.direction === "collection") {
      if (!txn.target_wallet_id) {
        return new Response(JSON.stringify({ error: "Collection has no target wallet" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const idempotencyRef = transactionId || reference;
      const { data: existing } = await supabase.from("ledger_entries").select("id")
        .eq("reference_type", "ghana_pay_topup")
        .eq("external_reference", idempotencyRef)
        .limit(1);
      if (existing?.length) {
        await supabase.from("ghana_pay_transactions").update({ status: "completed" }).eq("id", txn.id);
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: asset } = await supabase.from("ledger_accounts").select("id").eq("code", "1254").maybeSingle();
      const { data: liab } = await supabase.from("ledger_accounts").select("id").eq("code", "2106").maybeSingle();
      if (!asset || !liab) {
        return new Response(JSON.stringify({ error: "Missing GHS ledger accounts (1254/2106)" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const amount = Number(txn.amount);
      const journalId = crypto.randomUUID();
      const desc = `Ghana Pay top-up (${idempotencyRef})`;

      const { error: leErr } = await supabase.from("ledger_entries").insert([
        {
          journal_id: journalId,
          account_id: asset.id,
          wallet_id: null,
          currency_code: "GHS",
          debit_amount: amount,
          credit_amount: 0,
          description: desc,
          reference_type: "ghana_pay_topup",
          reference_id: txn.id,
          external_reference: idempotencyRef,
          created_by: txn.user_id,
        },
        {
          journal_id: journalId,
          account_id: liab.id,
          wallet_id: txn.target_wallet_id,
          currency_code: "GHS",
          debit_amount: 0,
          credit_amount: amount,
          description: desc,
          reference_type: "ghana_pay_topup",
          reference_id: txn.id,
          external_reference: idempotencyRef,
          created_by: txn.user_id,
        },
      ]);

      if (leErr) {
        return new Response(JSON.stringify({ error: "Ledger post failed" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase.from("ghana_pay_transactions").update({
        status: "completed",
        provider_reference: idempotencyRef,
      }).eq("id", txn.id);

      await supabase.from("notifications").insert({
        user_id: txn.user_id,
        title: "Wallet topped up",
        message: `Your GHS wallet has been credited GH₵${amount.toLocaleString()}.`,
        type: "wallet",
      }).then(() => null, () => null);

      sendTopupEmail(supabase, txn.user_id, "GHS", amount, idempotencyRef).catch(() => {});

      return new Response(JSON.stringify({ received: true, outcome: "collection_completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Payout: mark transfer completed ----
    if (txn.direction === "payout" && txn.transfer_id) {
      await supabase.from("transfers").update({ status: "completed" }).eq("id", txn.transfer_id);
      await supabase.from("ghana_pay_transactions").update({ status: "completed" }).eq("id", txn.id);

      await supabase.from("notifications").insert({
        user_id: txn.user_id,
        title: "Transfer delivered",
        message: `Your GHS transfer to ${txn.nickname || "recipient"} was delivered successfully.`,
        type: "success",
      }).then(() => null, () => null);

      return new Response(JSON.stringify({ received: true, outcome: "payout_completed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ received: true, outcome: "noop" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ghana-payment-callback error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
