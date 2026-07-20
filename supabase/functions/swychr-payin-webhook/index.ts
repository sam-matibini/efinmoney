import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getSwychrPaymentLinkStatus,
  parsePayinStatusCode,
  verifySwychrWebhookSignature,
} from "../_shared/swychr-payin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-swychr-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  NGN: "1270",
  GHS: "1271",
  USD: "1272",
  XAF: "1273",
  KES: "1274",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  NGN: "2102",
  USD: "2100",
  CAD: "2101",
  EUR: "2104",
  GBP: "2105",
  GHS: "2103",
  XAF: "2106",
  KES: "2107",
};

type SupabaseAdmin = ReturnType<typeof createClient>;
type PayinTxn = Record<string, unknown>;

async function findTxn(supabase: SupabaseAdmin, transactionId: string) {
  const byTxn = await supabase.from("swychr_payin_transactions")
    .select("*").eq("transaction_id", transactionId).maybeSingle();
  if (byTxn.data) return byTxn.data;
  const byRef = await supabase.from("swychr_payin_transactions")
    .select("*").eq("reference", transactionId).maybeSingle();
  return byRef.data;
}

async function completePayin(
  supabase: SupabaseAdmin,
  txn: PayinTxn,
  eventPayload: Record<string, unknown>,
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  if (txn.status === "completed") return { ok: true, duplicate: true };
  if (!txn.target_wallet_id) return { ok: false, error: "No target wallet" };

  const creditCurrency = String(txn.currency).toUpperCase();
  const creditAmount = Number(txn.amount);
  const idempotencyRef = String(txn.transaction_id);

  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "swychr_payin_topup")
    .eq("external_reference", idempotencyRef)
    .limit(1);
  if (existing?.length) {
    await supabase.from("swychr_payin_transactions").update({ status: "completed" }).eq("id", txn.id);
    return { ok: true, duplicate: true };
  }

  const assetCode = SETTLEMENT_BY_CURRENCY[creditCurrency] ?? SETTLEMENT_BY_CURRENCY.USD;
  const liabCode = LIABILITY_BY_CURRENCY[creditCurrency];
  if (!liabCode) return { ok: false, error: `No liability account for ${creditCurrency}` };

  const { data: asset } = await supabase.from("ledger_accounts").select("id").eq("code", assetCode).maybeSingle();
  const { data: liab } = await supabase.from("ledger_accounts").select("id").eq("code", liabCode).maybeSingle();
  if (!asset || !liab) return { ok: false, error: "Missing ledger accounts" };

  const journalId = crypto.randomUUID();
  const desc = `eFinMoney top-up (${idempotencyRef})`;

  const { error: leErr } = await supabase.from("ledger_entries").insert([
    {
      journal_id: journalId,
      account_id: asset.id,
      wallet_id: null,
      currency_code: creditCurrency,
      debit_amount: creditAmount,
      credit_amount: 0,
      description: desc,
      reference_type: "swychr_payin_topup",
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
      reference_type: "swychr_payin_topup",
      reference_id: txn.id,
      external_reference: idempotencyRef,
      created_by: txn.user_id,
    },
  ]);
  if (leErr) return { ok: false, error: "Ledger post failed" };

  await supabase.from("swychr_payin_transactions").update({
    status: "completed",
    provider_reference: idempotencyRef,
    last_event: eventPayload,
  }).eq("id", txn.id);

  await supabase.from("notifications").insert({
    user_id: txn.user_id,
    title: "Wallet topped up",
    message: `Your ${creditCurrency} wallet has been credited.`,
    type: "wallet",
  }).then(() => null, () => null);

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (req.method === "GET") {
    const url = new URL(req.url);
    const txnId = url.searchParams.get("transaction_id") ?? "";
    const appBase = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
    const outcome = url.searchParams.get("swychr") === "success" ? "success" : "failed";
    const redirect = `${appBase}/wallet/topup?swychr=${outcome}${txnId ? `&transaction_id=${encodeURIComponent(txnId)}` : ""}`;
    return Response.redirect(redirect, 302);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-swychr-signature") || req.headers.get("X-Swychr-Signature");
    if (!verifySwychrWebhookSignature(signature)) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {} as Record<string, unknown>;
    const outer = (payload.data && typeof payload.data === "object") ? payload.data as Record<string, unknown> : {};
    const inner = (outer.data && typeof outer.data === "object") ? outer.data as Record<string, unknown> : {};
    const attrs = (inner.attributes && typeof inner.attributes === "object")
      ? inner.attributes as Record<string, unknown>
      : (payload.attributes && typeof payload.attributes === "object")
      ? payload.attributes as Record<string, unknown>
      : payload;

    const transactionId = String(
      attrs.transaction_id ?? payload.transaction_id ?? "",
    ).trim();
    if (!transactionId) {
      return new Response(JSON.stringify({ received: true, matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txn = await findTxn(supabase, transactionId);
    if (!txn) {
      return new Response(JSON.stringify({ received: true, matched: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusCode = attrs.status ?? payload.status;
    const mapped = parsePayinStatusCode(statusCode);

    if (mapped === "failed" || mapped === "cancelled") {
      await supabase.from("swychr_payin_transactions").update({
        status: mapped,
        failure_reason: String(attrs.description ?? "Payment failed"),
        last_event: payload,
      }).eq("id", txn.id);
      return new Response(JSON.stringify({ received: true, credited: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mapped !== "completed") {
      await supabase.from("swychr_payin_transactions").update({
        status: "processing",
        last_event: payload,
      }).eq("id", txn.id);
      return new Response(JSON.stringify({ received: true, pending: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await completePayin(supabase, txn, payload as Record<string, unknown>);
    return new Response(JSON.stringify({ received: true, credited: result.ok, error: result.error }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("swychr-payin-webhook error:", e);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
