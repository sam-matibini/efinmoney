import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaFlovide } from "../_shared/flovide-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-flovide-signature, signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSuccessEvent(event: string, payload: Record<string, unknown>, data: Record<string, unknown>): boolean {
  const e = event.toLowerCase();
  if (
    e.includes("payment.success")
    || e.includes("collection.success")
    || e.includes("interac.success")
    || e.includes("payout.success")
    || e.includes("transfer.success")
  ) {
    return true;
  }
  const status = String(data.status ?? payload.status ?? "").toLowerCase();
  return ["success", "successful", "completed", "paid", "settled"].includes(status);
}

function isFailureEvent(event: string, payload: Record<string, unknown>, data: Record<string, unknown>): boolean {
  const e = event.toLowerCase();
  if (e.includes("failed") || e.includes("payout.failed") || e.includes("payment.failed")) return true;
  const status = String(data.status ?? payload.status ?? "").toLowerCase();
  return ["failed", "failure", "declined", "rejected", "cancelled", "canceled"].includes(status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET" || req.method === "HEAD") {
    return json({ ok: true, endpoint: "flovide-webhook" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const raw = await req.text();
    console.log("flovide-webhook raw:", raw.slice(0, 4000));

    const webhookSecret = (Deno.env.get("FLOVIDE_WEBHOOK_SECRET") || "").trim();
    const signature = req.headers.get("x-flovide-signature")
      || req.headers.get("signature")
      || req.headers.get("X-Signature")
      || "";
    if (webhookSecret && signature && signature !== webhookSecret) {
      return json({ error: "Invalid signature" }, 401);
    }

    const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const data = (payload.data && typeof payload.data === "object")
      ? payload.data as Record<string, unknown>
      : payload;
    const event = String(payload.event || payload.type || payload.event_type || data.event || "");

    const providerRef = String(
      data.reference ?? payload.reference ?? data.transaction_id ?? data.id ?? payload.id ?? "",
    ).trim();
    const orderId = String(data.transaction_id ?? data.order_id ?? payload.order_id ?? "").trim();
    const amount = Number(data.amount ?? payload.amount);
    const currency = String(data.currency ?? payload.currency ?? "CAD").toUpperCase();

    let txn = null as Record<string, unknown> | null;
    if (providerRef) {
      const r = await admin.from("flovide_transactions").select("*")
        .eq("provider_reference", providerRef).maybeSingle();
      txn = r.data;
    }
    if (!txn && orderId) {
      const r = await admin.from("flovide_transactions").select("*")
        .eq("provider_order_id", orderId).maybeSingle();
      txn = r.data;
    }
    if (!txn && providerRef) {
      const r = await admin.from("flovide_transactions").select("*")
        .eq("reference", providerRef).maybeSingle();
      txn = r.data;
    }
    if (!txn) {
      const email = String(data.email ?? data.payer_email ?? payload.email ?? "").trim().toLowerCase();
      if (email && Number.isFinite(amount) && amount > 0) {
        const { data: rows } = await admin.from("flovide_transactions").select("*")
          .eq("kind", "interac_collection")
          .in("status", ["pending", "awaiting_payment", "processing"])
          .eq("amount", amount)
          .ilike("payer_email", email)
          .order("created_at", { ascending: false })
          .limit(1);
        txn = rows?.[0] ?? null;
      }
    }

    if (!txn) {
      return json({ received: true, matched: false, provider_reference: providerRef || null });
    }

    if (txn.status === "completed" || txn.status === "failed") {
      return json({ received: true, outcome: "duplicate", status: txn.status });
    }

    const kind = String(txn.kind || "interac_collection");

    // ── Payout: mark transfer complete / failed — never credit wallet ──
    if (kind === "payout") {
      if (isFailureEvent(event, payload, data)) {
        const reason = String(data.message ?? payload.message ?? "Flovide payout failed").slice(0, 500);
        await admin.from("flovide_transactions").update({
          status: "failed",
          failure_reason: reason,
          last_event: payload,
        }).eq("id", txn.id);
        if (txn.transfer_id) {
          await admin.from("transfers").update({
            status: "failed",
            failure_reason: reason,
          }).eq("id", txn.transfer_id);
        }
        return json({ received: true, outcome: "payout_failed" });
      }

      if (!isSuccessEvent(event, payload, data)) {
        return json({ received: true, outcome: "ignored", event: event || null, kind });
      }

      await admin.from("flovide_transactions").update({
        status: "completed",
        credited_at: new Date().toISOString(),
        provider_reference: providerRef || txn.provider_reference,
        last_event: payload,
      }).eq("id", txn.id);

      if (txn.transfer_id) {
        await admin.from("transfers").update({
          status: "completed",
          completed_at: new Date().toISOString(),
          provider_reference: providerRef || txn.provider_reference,
        }).eq("id", txn.transfer_id);
      }

      return json({ received: true, outcome: "payout_completed", transfer_id: txn.transfer_id });
    }

    // ── Collection (Interac top-up): credit wallet ──
    if (!isSuccessEvent(event, payload, data)) {
      if (isFailureEvent(event, payload, data)) {
        await admin.from("flovide_transactions").update({
          status: "failed",
          failure_reason: String(data.message ?? payload.message ?? "Payment failed").slice(0, 500),
          last_event: payload,
        }).eq("id", txn.id);
        return json({ received: true, outcome: "collection_failed" });
      }
      return json({ received: true, outcome: "ignored", event: event || null });
    }

    const creditAmount = Number(txn.credit_amount ?? txn.amount);
    const creditCurrency = String(txn.credit_currency ?? txn.currency_code ?? currency).toUpperCase();
    const idem = String(txn.reference || providerRef || txn.id);

    const credit = await creditWalletViaFlovide(
      admin,
      String(txn.user_id),
      creditCurrency,
      creditAmount,
      idem,
      txn.target_wallet_id ? String(txn.target_wallet_id) : undefined,
    );

    await admin.from("flovide_transactions").update({
      status: "completed",
      credited_at: new Date().toISOString(),
      provider_reference: providerRef || txn.provider_reference,
      last_event: payload,
    }).eq("id", txn.id);

    if (txn.purpose === "transfer" && txn.transfer_id) {
      try {
        const base = Deno.env.get("SUPABASE_URL")!;
        const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        await fetch(`${base}/functions/v1/execute-transfer`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${service}`,
            "Content-Type": "application/json",
            apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
          },
          body: JSON.stringify({
            transfer_id: txn.transfer_id,
            internal_secret: Deno.env.get("INTERNAL_FUNCTION_SECRET") || service,
          }),
        });
      } catch (e) {
        console.warn("flovide-webhook: transfer release failed", e);
      }
    }

    return json({
      received: true,
      outcome: "credited",
      already: credit.already,
      wallet_id: credit.wallet_id,
    });
  } catch (err) {
    console.error("flovide-webhook error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
