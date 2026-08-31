import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getNombaPayConfig } from "../_shared/nomba-pay.ts";
import { sendTopupEmail } from "../_shared/topup-email.ts";

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
  const order = (data.order && typeof data.order === "object")
    ? data.order as Record<string, unknown>
    : (payload.order && typeof payload.order === "object")
    ? payload.order as Record<string, unknown>
    : {};
  return String(
    order.orderId
    ?? order.order_id
    ?? data.orderId
    ?? data.order_id
    ?? payload.orderId
    ?? payload.order_id
    ?? order.orderReference
    ?? order.order_reference
    ?? data.orderReference
    ?? data.order_reference
    ?? payload.orderReference
    ?? payload.order_reference
    ?? data.id
    ?? payload.id
    ?? "",
  ).trim();
}

function extractMerchantReference(payload: Record<string, unknown>, data: Record<string, unknown>): string {
  const order = (data.order && typeof data.order === "object")
    ? data.order as Record<string, unknown>
    : (payload.order && typeof payload.order === "object")
    ? payload.order as Record<string, unknown>
    : {};
  return String(
    order.orderReference
    ?? order.order_reference
    ?? data.orderReference
    ?? data.order_reference
    ?? payload.orderReference
    ?? payload.order_reference
    ?? data.merchantReference
    ?? data.merchant_reference
    ?? payload.merchantReference
    ?? data.reference
    ?? payload.reference
    ?? "",
  ).trim();
}

function detectSuccess(payload: Record<string, unknown>, data: Record<string, unknown>): boolean {
  // Official Nomba Developer webhook: event_type === "payment_success"
  const eventType = String(payload.event_type ?? payload.eventType ?? "").toLowerCase();
  if (eventType === "payment_success" || eventType.includes("payment_success")) return true;

  const event = String(payload.event ?? payload.type ?? eventType).toLowerCase();
  if (event.includes("success") || event.includes("completed") || event.includes("paid")) return true;

  const code = String(data.status_code ?? payload.status_code ?? data.code ?? payload.code ?? "");
  if (code === "00" || code === "200" || code === "202") return true;

  const status = data.status ?? payload.status ?? data.payment_status ?? payload.payment_status;
  if (isSuccessStatus(status)) return true;

  const msg = String(data.message ?? payload.message ?? payload.description ?? "").toLowerCase();
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
  const refs = [orderId, reference].map((r) => String(r || "").trim()).filter(Boolean);
  for (const ref of refs) {
    const byOrder = await supabase.from("nomba_pay_transactions").select("*").eq("order_id", ref).maybeSingle();
    if (byOrder.data) return byOrder.data;
    const byRef = await supabase.from("nomba_pay_transactions").select("*").eq("reference", ref).maybeSingle();
    if (byRef.data) return byRef.data;
    const byProvider = await supabase.from("nomba_pay_transactions").select("*").eq("provider_reference", ref).maybeSingle();
    if (byProvider.data) return byProvider.data;
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

  if (!Number.isFinite(creditAmount) || !(creditAmount > 0)) {
    return { ok: false, error: `Invalid Nomba credit amount: ${creditAmount}` };
  }

  // Prefer stable merchant reference so browser return + webhook cannot double-post.
  const idempotencyRef = String(txn.reference || orderId || "").trim();
  if (!idempotencyRef) return { ok: false, error: "Missing Nomba top-up reference" };

  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "nomba_pay_topup")
    .eq("external_reference", idempotencyRef)
    .limit(1);
  if (existing?.length) {
    await supabase.from("nomba_pay_transactions").update({ status: "completed" }).eq("id", txn.id);
    return { ok: true, duplicate: true };
  }
  // Legacy: prior credits may have keyed on orderId instead of merchant reference
  if (orderId && orderId !== idempotencyRef) {
    const { data: byOrder } = await supabase.from("ledger_entries").select("id")
      .eq("reference_type", "nomba_pay_topup")
      .eq("external_reference", orderId)
      .limit(1);
    if (byOrder?.length) {
      await supabase.from("nomba_pay_transactions").update({ status: "completed" }).eq("id", txn.id);
      return { ok: true, duplicate: true };
    }
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
    ? `eFinMoney top-up (${idempotencyRef}) — ${checkoutAmount} ${checkoutCurrency} → ${creditAmount} ${creditCurrency}`
    : `eFinMoney top-up (${idempotencyRef})`;

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

  sendTopupEmail(supabase, txn.user_id, creditCurrency, creditAmount, idempotencyRef).catch(() => {});

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

  // Never credit on browser return without Nomba confirming payment.
  // Cancel/close often returns with orderId but no failure status — that used to fake-complete.
  if (txn.status === "completed") {
    return Response.redirect(buildReturnUrl(txn, "success"), 302);
  }

  await supabase.from("nomba_pay_transactions").update({
    last_event: {
      ...Object.fromEntries(url.searchParams.entries()),
      note: "browser_return_unverified_no_credit",
    },
  }).eq("id", txn.id);

  return Response.redirect(buildReturnUrl(txn, "failed"), 302);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "GET" || req.method === "HEAD") {
    // Prefer verifying with Nomba before crediting on browser return.
    const url = new URL(req.url);
    const orderId = String(url.searchParams.get("orderId") ?? url.searchParams.get("order_id") ?? "").trim();
    const reference = String(
      url.searchParams.get("orderReference")
      ?? url.searchParams.get("order_reference")
      ?? url.searchParams.get("reference")
      ?? "",
    ).trim();
    if ((orderId || reference) && !isFailureStatus(url.searchParams.get("status"))) {
      try {
        const { fetchNombaCheckoutTransaction } = await import("../_shared/nomba-api.ts");
        const id = reference || orderId;
        const idType = id.startsWith("efin-nomba") ? "ORDER_REFERENCE" as const : "ORDER_ID" as const;
        const fetched = await fetchNombaCheckoutTransaction({ id, idType });
        if (fetched.paid) {
          const txn = await findTxn(supabase, orderId, reference || undefined);
          if (txn && txn.status !== "completed") {
            const result = await completeNombaCollection(
              supabase,
              txn,
              orderId || String(txn.order_id || ""),
              { ...Object.fromEntries(url.searchParams.entries()), nomba_verify: fetched.json },
            );
            if (result.ok) return Response.redirect(buildReturnUrl(txn, "success"), 302);
          } else if (txn?.status === "completed") {
            return Response.redirect(buildReturnUrl(txn, "success"), 302);
          }
        }
      } catch (e) {
        console.warn("nomba browser return verify failed", e);
      }
    }
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
    const merchantRef = extractMerchantReference(payload, data);
    const statusRaw = data.status ?? payload.status ?? data.payment_status;
    const isSuccess = detectSuccess(payload, data);
    const isFailure = isFailureStatus(statusRaw)
      || String(payload.event ?? payload.event_type ?? "").toLowerCase().includes("fail");

    const txn = await findTxn(
      supabase,
      orderId,
      merchantRef || String(data.reference ?? payload.reference ?? "").trim() || undefined,
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
