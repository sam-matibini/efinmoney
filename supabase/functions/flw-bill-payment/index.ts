import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
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

    // Wallet + balance check
    const { data: wallet } = await admin.from("wallets").select("id").eq("user_id", userId).eq("currency_code", currency).maybeSingle();
    if (!wallet) return new Response(JSON.stringify({ error: `No ${currency} wallet found` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: balData } = await admin.rpc("get_wallet_balance", { p_wallet_id: wallet.id });
    const balance = Number(balData || 0);
    if (balance < amount) return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const reference = `efm_bill_${userId.slice(0, 8)}_${Date.now()}`;

    // Create pending bill_payment row
    const { data: bill, error: bErr } = await admin.from("bill_payments").insert({
      user_id: userId, wallet_id: wallet.id, category, biller_code: billerCode, biller_name: billerName,
      customer_identifier: customerIdentifier, amount, currency, reference, status: "pending",
    }).select("*").single();
    if (bErr) throw bErr;

    // Debit user wallet via ledger
    const { data: liabilityAcct } = await admin.from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", currency).limit(1).maybeSingle();
    const { data: expenseAcct } = await admin.from("ledger_accounts").select("id").like("code", "5%").eq("currency_code", currency).limit(1).maybeSingle();
    if (liabilityAcct && expenseAcct) {
      const journalId = crypto.randomUUID();
      await admin.from("ledger_entries").insert([
        { journal_id: journalId, account_id: liabilityAcct.id, wallet_id: wallet.id, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Bill payment ${category}`, reference_type: "bill_payment", reference_id: bill.id },
        { journal_id: journalId, account_id: expenseAcct.id, wallet_id: null, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Bill payment ${category}`, reference_type: "bill_payment", reference_id: bill.id },
      ]);
    }

    const FLW_KEY = Deno.env.get("FLW_SECRET_KEY");
    if (!FLW_KEY) return new Response(JSON.stringify({ error: "Flutterwave not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const flwRes = await fetch("https://api.flutterwave.com/v3/bills", {
      method: "POST",
      headers: { Authorization: `Bearer ${FLW_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ country, customer: customerIdentifier, amount, type: billerCode, reference }),
    });
    const flwJson = await flwRes.json();

    const ok = flwRes.ok && (flwJson?.status === "success");
    await admin.from("bill_payments").update({
      status: ok ? "processing" : "failed",
      flw_reference: flwJson?.data?.reference || null,
      flw_response: flwJson,
      failure_reason: ok ? null : (flwJson?.message || "Flutterwave error"),
    }).eq("id", bill.id);

    if (!ok) {
      // Refund: reverse ledger
      if (liabilityAcct && expenseAcct) {
        const j = crypto.randomUUID();
        await admin.from("ledger_entries").insert([
          { journal_id: j, account_id: liabilityAcct.id, wallet_id: wallet.id, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Bill payment refund ${category}`, reference_type: "bill_payment_refund", reference_id: bill.id },
          { journal_id: j, account_id: expenseAcct.id, wallet_id: null, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Bill payment refund ${category}`, reference_type: "bill_payment_refund", reference_id: bill.id },
        ]);
      }
      return new Response(JSON.stringify({ success: false, error: flwJson?.message || "Bill payment failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, bill_id: bill.id, reference, flw_data: flwJson?.data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-bill-payment error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
