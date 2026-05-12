// V4 bill payment — POST /bills
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwFetch, isFlwSuccess } from "../_shared/flw-v4.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const category = String(body?.category || "");
    const billerCode = String(body?.billerCode || "");
    const billerName = body?.billerName ? String(body.billerName) : null;
    const customerIdentifier = String(body?.customerIdentifier || "");
    const amount = Number(body?.amount);
    const currency = (body?.currency || "NGN").toString().toUpperCase();
    const country = (body?.country || "NG").toString().toUpperCase();
    if (!category || !billerCode || !customerIdentifier || !Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", { p_key: `flw_bill:${userId}`, p_max_requests: 5, p_window_seconds: 60 });
    if (rl === false) return new Response(JSON.stringify({ error: "Too many requests" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: wallet } = await admin.from("wallets").select("id").eq("user_id", userId).eq("currency_code", currency).maybeSingle();
    if (!wallet) return new Response(JSON.stringify({ error: `No ${currency} wallet found` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: balData } = await admin.rpc("get_wallet_balance", { p_wallet_id: wallet.id });
    if (Number(balData || 0) < amount) return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const reference = `efm_bill_${userId.slice(0, 8)}_${Date.now()}`;
    const { data: bill, error: bErr } = await admin.from("bill_payments").insert({
      user_id: userId, wallet_id: wallet.id, category, biller_code: billerCode, biller_name: billerName,
      customer_identifier: customerIdentifier, amount, currency, reference, status: "pending",
    }).select("*").single();
    if (bErr) throw bErr;

    // Debit wallet via ledger
    const { data: liab } = await admin.from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", currency).limit(1).maybeSingle();
    const { data: exp } = await admin.from("ledger_accounts").select("id").like("code", "5%").eq("currency_code", currency).limit(1).maybeSingle();
    if (liab && exp) {
      const j = crypto.randomUUID();
      await admin.from("ledger_entries").insert([
        { journal_id: j, account_id: liab.id, wallet_id: wallet.id, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Bill payment ${category}`, reference_type: "bill_payment", reference_id: bill.id },
        { journal_id: j, account_id: exp.id, wallet_id: null, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Bill payment ${category}`, reference_type: "bill_payment", reference_id: bill.id },
      ]);
    }

    const { ok, json } = await flwFetch("/bills", {
      method: "POST",
      body: JSON.stringify({ country, customer: customerIdentifier, amount, type: billerCode, reference }),
      idempotencyKey: reference,
    });

    const success = ok && isFlwSuccess(json);
    await admin.from("bill_payments").update({
      status: success ? "processing" : "failed",
      flw_reference: json?.data?.reference || null,
      flw_response: json,
      failure_reason: success ? null : (json?.message || "Flutterwave error"),
    }).eq("id", bill.id);

    if (!success) {
      if (liab && exp) {
        const j = crypto.randomUUID();
        await admin.from("ledger_entries").insert([
          { journal_id: j, account_id: liab.id, wallet_id: wallet.id, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Bill payment refund ${category}`, reference_type: "bill_payment_refund", reference_id: bill.id },
          { journal_id: j, account_id: exp.id, wallet_id: null, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Bill payment refund ${category}`, reference_type: "bill_payment_refund", reference_id: bill.id },
        ]);
      }
      return new Response(JSON.stringify({ success: false, error: json?.message || "Bill payment failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true, bill_id: bill.id, reference, flw_data: json?.data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-bill-payment error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
