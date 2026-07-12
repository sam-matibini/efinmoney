import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getNombaPayConfig } from "../_shared/nomba-pay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, signature",
  "Access-Control-Allow-Methods": "POST, GET, HEAD, OPTIONS",
};

const SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  NGN: "1260",
  USD: "1261",
  EUR: "1262",
  GBP: "1263",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  NGN: "2102",
  USD: "2100",
  CAD: "2101",
  EUR: "2104",
  GBP: "2105",
};

type SupabaseAdmin = ReturnType<typeof createClient>;
type NombaTxn = Record<string, unknown>;

function isFailureStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["failed", "failure", "declined", "rejected", "cancelled", "canceled", "error"].includes(s);
}

function isSuccessStatus(status: unknown): boolean {
  const s = String(status ?? "").toLowerCase();
  return ["success", "successful", "completed", "approved", "paid", "settled"].includes(s);
}

function extractOrderId(payload: Record<string, unknown>, data: Record<string, unknown>): string {
  return String(
    data.order_id ?? data.orderId ?? payload.order_id ?? payload.orderId
    ?? data.id ?? payload.id ?? "",
  ).trim();
}

function detectSuccess(payload: Record<string, unknown>, data: Record<string, unknown>): boolean {
  const event = String(payload.event ?? payload.type ?? "").toLowerCase();
  if (event.includes("success") || event.includes("completed") || event.includes("paid")) return true;

  const code = String(data.status_code ?? payload.status_code ?? data.code ?? payload.code ?? "");
  if (code === "00" || code === "200" || code === "202") return true;

  const status = data.status ?? payload.status ?? data.payment_status ?? payload.payment_status;
  if (isSuccessStatus(status)) return true;

  const msg = String(data.message ?? payload.message ?? "").toLowerCase();
  if (msg.includes("success") || msg.includes("completed") || msg.includes("paid")) return true;

  return false;
}

function buildReturnUrl(txn: NombaTxn, outcome: "success" | "failed"): string {
  const raw = (txn.raw_request && typeof txn.raw_request === "object")
    ? txn.raw_request as Record<string, unknown>
    : {};
  const appBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
  const fallback = `${appBase}/wallet/topup`;
  const stored = String(raw.return_url || "").trim();
  const base = stored || fallback;
  const url = new URL(base);
  url.searchParams.set("nomba", outcome);
  if (txn.target_wallet_id) url.searchParams.set("walletId", String(txn.target_wallet_id));
  if (txn.order_id) url.searchParams.set("orderId", String(txn.order_id));
  return url.toString();
}

async function findTxn(
  supabase: SupabaseAdmin,
  orderId: string,
  reference?: string,
) {
  if (orderId) {
    const r = await supabase.from("nomba_pay_transactions").select("*").eq("order_id", orderId).maybeSingle();
    if (r.data) return r.data;
  }
  if (reference) {
    const r = await supabase.from("nomba_pay_transactions").select("*").eq("reference", reference).maybeSingle();
    if (r.data) return r.data;
  }
  return null;
}

async function completeNombaCollection(
  supabase: SupabaseAdmin,
  txn: NombaTxn,
  orderId: string,
  eventPayload: Record<string, unknown>,
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  if (txn.status === "completed") return { ok: true, duplicate: true };

  await supabase.from("nomba_pay_transactions").update({ last_event: eventPayload }).eq("id", txn.id);

  if (!txn.target_wallet_id) return { ok: false, error: "Collection has no target wallet" };

  const creditCurrency = String(txn.credit_currency ?? txn.currency).toUpperCase();
  const creditAmount = txn.credit_amount != null ? Number(txn.credit_amount) : Number(txn.amount);
  const checkoutCurrency = String(txn.checkout_currency ?? txn.currency).toUpperCase();
  const checkoutAmount = txn.checkout_amount != null ? Number(txn.checkout_amount) : Number(txn.amount);

  const idempotencyRef = orderId || String(txn.reference);

  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "nomba_pay_topup")
    .eq("external_reference", idempotencyRef)
    .limit(1);
  if (existing?.length) {
    await supabase.from("nomba_pay_transactions").update({ status: "completed" }).eq("id", txn.id);
    return { ok: true, duplicate: true };
  }

  const settlementByCurrency: Record<string, string> = {
    ...SETTLEMENT_BY_CURRENCY,
    CAD: "1261", // CAD wallet funded via USD Nomba settlement
  };
  const assetCode = settlementByCurrency[checkoutCurrency];
  const liabCode = LIABILITY_BY_CURRENCY[creditCurrency];
  if (!assetCode || !liabCode) {
    return { ok: false, error: `Missing ledger mapping for checkout ${checkoutCurrency} / credit ${creditCurrency}` };
  }

  const { data: asset } = await supabase.from("ledger_accounts").select("id").eq("code", assetCode).maybeSingle();
  const { data: liab } = await supabase.from("ledger_accounts").select("id").eq("code", liabCode).maybeSingle();
  if (!asset || !liab) return { ok: false, error: `Missing ledger accounts (${assetCode}/${liabCode})` };

  const journalId = crypto.randomUUID();
  const desc = creditCurrency !== checkoutCurrency
    ? `Nomba top-up (${idempotencyRef}) — ${checkoutAmount} ${checkoutCurrency} → ${creditAmount} ${creditCurrency}`
    : `Nomba top-up (${idempotencyRef})`;

  const { error: leErr } = await supabase.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: asset.id,
      wallet_id: null,
      currency_code: checkoutCurrency,
      debit_amount: checkoutAmount,
      credit_amount: 0,
      description: desc,
      reference_type: "nomba_pay_topup",
      reference_id: txn.id,
      external_reference: idempotencyRef,
      created_by: txn.user_id,
    },
    {
      journal_id: journalId,
      account_id: liab.id,
      wallet_id: txn.target_wallet_id,
      currency_code: creditCurrency,
      debit_amount: 0,
      credit_amount: creditAmount,
      description: desc,
      reference_type: "nomba_pay_topup",
      reference_id: txn.id,
      external_reference: idempotencyRef,
      created_by: txn.user_id,
    },
  ]);

  if (leErr) return { ok: false, error: "Ledger post failed" };

  await supabase.from("nomba_pay_transactions").update({
    status: "completed",
    provider_reference: idempotencyRef,
  }).eq("id", txn.id);

  const symbol = creditCurrency === "NGN" ? "₦"
    : creditCurrency === "GBP" ? "£"
    : creditCurrency === "EUR" ? "€"
    : creditCurrency === "CAD" ? "C$"
    : "$";
  await supabase.from("notifications").insert({
    user_id: txn.user_id,
    title: "Wallet topped up",
    message: `Your ${creditCurrency} wallet has been credited ${symbol}${creditAmount.toLocaleString()}.`,
    type: "wallet",
  }).then(() => null, () => null);

  return { ok: true };
}

async function handleBrowserReturn(req: Request, supabase: SupabaseAdmin): Promise<Response> {
  const url = new URL(req.url);
  const orderId = String(
    url.searchParams.get("orderId")
    ?? url.searchParams.get("order_id")
    ?? "",
  ).trim();
  const reference = String(
    url.searchParams.get("orderReference")
    ?? url.searchParams.get("order_reference")
    ?? url.searchParams.get("reference")
    ?? "",
  ).trim();
  const statusParam = url.searchParams.get("status") ?? url.searchParams.get("paymentStatus");

  if (!orderId && !reference) {
    return new Response(
      JSON.stringify({ ok: true, endpoint: "nomba-payment-callback" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  console.log("nomba-payment-callback browser return:", { orderId, reference, statusParam });

  const txn = await findTxn(supabase, orderId, reference || undefined);
  if (!txn) {
    const appBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
    return Response.redirect(`${appBase}/wallet/topup?nomba=unknown`, 302);
  }

  if (isFailureStatus(statusParam)) {
    await supabase.from("nomba_pay_transactions").update({
      status: "failed",
      failure_reason: String(statusParam),
      last_event: Object.fromEntries(url.searchParams.entries()),
    }).eq("id", txn.id);
    return Response.redirect(buildReturnUrl(txn, "failed"), 302);
  }

  const eventPayload = Object.fromEntries(url.searchParams.entries());
  const result = await completeNombaCollection(
    supabase,
    txn,
    orderId || String(txn.order_id || ""),
    eventPayload,
  );

  if (!result.ok) {
    console.error("nomba browser return credit failed:", result.error);
    return Response.redirect(buildReturnUrl(txn, "failed"), 302);
  }

  return Response.redirect(buildReturnUrl(txn, "success"), 302);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "GET" || req.method === "HEAD") {
    return handleBrowserReturn(req, supabase);
  }

  try {
    const rawBody = await req.text();
    console.log("nomba-payment-callback raw:", rawBody.slice(0, 4000));

    const { webhookSecret } = getNombaPayConfig();
    const signature = req.headers.get("signature") || req.headers.get("Signature") || "";
    if (webhookSecret && signature && signature !== webhookSecret) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const data = (payload.data && typeof payload.data === "object")
      ? payload.data as Record<string, unknown>
      : (payload.Data && typeof payload.Data === "object")
      ? payload.Data as Record<string, unknown>
      : payload as Record<string, unknown>;

    const orderId = extractOrderId(payload, data);
    const statusRaw = data.status ?? payload.status ?? data.payment_status;
    const isSuccess = detectSuccess(payload, data);
    const isFailure = isFailureStatus(statusRaw)
      || String(payload.event ?? "").toLowerCase().includes("fail");

    const txn = await findTxn(
      supabase,
      orderId,
      String(data.reference ?? payload.reference ?? "").trim() || undefined,
    );
    if (!txn) {
      return new Response(JSON.stringify({ received: true, matched: false, order_id: orderId || null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isFailure) {
      const reason = String(data.message ?? data.reason ?? payload.message ?? "Payment failed");
      await supabase.from("nomba_pay_transactions").update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
        last_event: payload,
      }).eq("id", txn.id);
      return new Response(JSON.stringify({ received: true, outcome: "failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isSuccess) {
      return new Response(JSON.stringify({ received: true, outcome: "ignored" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await completeNombaCollection(supabase, txn, orderId || String(txn.order_id || ""), payload);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      received: true,
      outcome: "collection_completed",
      duplicate: result.duplicate ?? false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("nomba-payment-callback error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
