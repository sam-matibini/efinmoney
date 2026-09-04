/**
 * ePay async pay-in notifyUrl handler.
 * Expects JSON { param, sign } (or flat param fields). Verifies signature, credits wallet.
 * Responds with plain "SUCCESS" so ePay stops retrying.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaEpay } from "../_shared/epay-credit.ts";
import { verifyEpayCallback } from "../_shared/epay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** ePay success statuses vary by product — treat these as paid. */
function isPaidStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "1" ||
    s === "2" ||
    s === "success" ||
    s === "succeeded" ||
    s === "paid" ||
    s === "completed" ||
    s === "successful"
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return text("epay-webhook ok");

  const rawBody = await req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    // Some ePay envs POST form-urlencoded
    try {
      const params = new URLSearchParams(rawBody);
      const obj: Record<string, unknown> = {};
      for (const [k, v] of params.entries()) obj[k] = v;
      payload = obj;
    } catch {
      return json(400, { error: "Invalid body" });
    }
  }

  const sign = String(payload.sign || "").trim();
  let param = (payload.param && typeof payload.param === "object"
    ? payload.param
    : payload) as Record<string, unknown>;
  // If flat body includes sign, strip it before verify
  if (!payload.param && param.sign) {
    const { sign: _s, ...rest } = param;
    param = rest;
  }

  if (!sign) {
    console.error("epay-webhook missing sign");
    return text("FAIL", 400);
  }

  const ok = await verifyEpayCallback("payin", param, sign);
  if (!ok) {
    console.error("epay-webhook signature verify failed");
    return text("FAIL", 401);
  }

  const merchantOrderNo = String(
    param.merchantOrderNo || param.merchant_order_no || "",
  ).trim();
  const epayOrderNo = String(param.epayOrderNo || param.epay_order_no || "").trim();
  const status = String(param.status || param.orderStatus || param.payStatus || "");
  const currency = String(param.currency || "").toUpperCase();
  const amount = Number(param.amount ?? param.receiveAmount ?? 0);

  if (!merchantOrderNo) {
    console.error("epay-webhook missing merchantOrderNo", param);
    return text("FAIL", 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: row } = await admin.from("epay_payin_transactions")
    .select("*")
    .eq("id", merchantOrderNo)
    .maybeSingle();

  if (!row) {
    console.error("epay-webhook unknown order", merchantOrderNo);
    // Acknowledge so ePay does not retry forever for unknown/test orders
    return text("SUCCESS");
  }

  if (!isPaidStatus(status)) {
    await admin.from("epay_payin_transactions").update({
      status: status || "failed",
      epay_order_no: epayOrderNo || row.epay_order_no,
      raw: payload,
      updated_at: new Date().toISOString(),
    }).eq("id", merchantOrderNo);
    return text("SUCCESS");
  }

  const creditAmount = Number(row.amount);
  const creditCurrency = String(row.currency).toUpperCase();
  if (!(creditAmount > 0) || !creditCurrency) {
    console.error("epay-webhook bad stored intent", merchantOrderNo, row);
    return text("FAIL", 400);
  }

  try {
    const result = await creditWalletViaEpay(
      admin,
      row.user_id,
      creditCurrency,
      creditAmount,
      merchantOrderNo,
      row.wallet_id || undefined,
      `Top-up via ePay (${epayOrderNo || merchantOrderNo})`,
    );

    await admin.from("epay_payin_transactions").update({
      status: "succeeded",
      epay_order_no: epayOrderNo || row.epay_order_no,
      wallet_id: result.wallet_id,
      amount: creditAmount,
      currency: creditCurrency,
      raw: payload,
      updated_at: new Date().toISOString(),
    }).eq("id", merchantOrderNo);

    return text("SUCCESS");
  } catch (err) {
    console.error("epay-webhook credit failed", err);
    return text("FAIL", 500);
  }
});
