import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function creditWalletViaLedger(admin: ReturnType<typeof createClient>, userId: string, currency: string, amount: number, txRef: string, flwTxId: string) {
  // Find/create user's wallet
  let { data: wallet } = await admin.from("wallets").select("id").eq("user_id", userId).eq("currency_code", currency).maybeSingle();
  if (!wallet) {
    const { data: newW } = await admin.from("wallets").insert({ user_id: userId, currency_code: currency, is_default: false }).select("id").single();
    wallet = newW!;
  }
  // Check idempotency
  const { data: existing } = await admin.from("ledger_entries").select("id").eq("reference_type", "flw_topup").eq("reference_id", txRef).limit(1);
  if (existing && existing.length > 0) return { wallet_id: wallet.id, already: true };

  const { data: liabilityAcct } = await admin.from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", currency).limit(1).maybeSingle();
  const { data: cashAcct } = await admin.from("ledger_accounts").select("id").like("code", "11%").eq("currency_code", currency).limit(1).maybeSingle();
  if (!liabilityAcct || !cashAcct) {
    console.warn("Missing ledger accounts for currency", currency);
  }

  const journalId = crypto.randomUUID();
  const rows = [];
  if (cashAcct) rows.push({ journal_id: journalId, account_id: cashAcct.id, wallet_id: null, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Top-up via Flutterwave ${flwTxId}`, reference_type: "flw_topup", reference_id: txRef });
  if (liabilityAcct) rows.push({ journal_id: journalId, account_id: liabilityAcct.id, wallet_id: wallet.id, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Top-up via Flutterwave ${flwTxId}`, reference_type: "flw_topup", reference_id: txRef });
  if (rows.length === 2) {
    const { error } = await admin.from("ledger_entries").insert(rows);
    if (error) throw error;
  }
  return { wallet_id: wallet.id, already: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await supabase.auth.getClaims(token);
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = claims.claims.sub as string;

    const url = new URL(req.url);
    const transactionId = url.searchParams.get("transaction_id") || url.searchParams.get("transactionId");
    const txRef = url.searchParams.get("tx_ref") || url.searchParams.get("txRef");
    if (!transactionId) return new Response(JSON.stringify({ error: "transaction_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const FLW_KEY = Deno.env.get("FLW_SECRET_KEY");
    if (!FLW_KEY) return new Response(JSON.stringify({ error: "Flutterwave not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${FLW_KEY}` },
    });
    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || verifyJson?.status !== "success") {
      return new Response(JSON.stringify({ verified: false, error: verifyJson?.message || "Verification failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = verifyJson.data;
    const meta = d?.meta || {};
    if (meta.user_id && meta.user_id !== userId) {
      return new Response(JSON.stringify({ verified: false, error: "Transaction does not belong to you" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (d?.status !== "successful") {
      return new Response(JSON.stringify({ verified: false, status: d?.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const result = await creditWalletViaLedger(admin, userId, d.currency, Number(d.amount), txRef || d.tx_ref, String(d.id));

    if (!result.already) {
      await admin.from("notifications").insert({
        user_id: userId,
        title: "Wallet topped up",
        message: `${d.currency} ${d.amount} added to your wallet.`,
        type: "transfer",
      });
    }

    return new Response(JSON.stringify({ verified: true, amount: d.amount, currency: d.currency, already_credited: result.already }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-verify-payment error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
