// V3 charge verification: GET /v3/transactions/verify_by_reference?tx_ref=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

async function creditWalletViaLedger(admin: ReturnType<typeof createClient>, userId: string, currency: string, amount: number, ref: string, flwId: string) {
  let { data: wallet } = await admin.from("wallets").select("id").eq("user_id", userId).eq("currency_code", currency).maybeSingle();
  if (!wallet) {
    const { data: nw } = await admin.from("wallets").insert({ user_id: userId, currency_code: currency, is_default: false }).select("id").single();
    wallet = nw!;
  }
  const { data: existing } = await admin.from("ledger_entries").select("id").eq("reference_type", "flw_topup").eq("reference_id", ref).limit(1);
  if (existing && existing.length > 0) return { wallet_id: wallet.id, already: true };

  // FLW settlement accounts are in the 12xx range (e.g. 1231 = Flutterwave Settlement - NGN).
  // Fall back to 11xx (Bank Trust) if no 12xx account exists for the currency.
  const { data: liab } = await admin.from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", currency).order("code").limit(1).maybeSingle();
  let { data: cash } = await admin.from("ledger_accounts").select("id").like("code", "123%").eq("currency_code", currency).limit(1).maybeSingle();
  if (!cash) {
    const { data: fallback } = await admin.from("ledger_accounts").select("id").like("code", "12%").eq("currency_code", currency).limit(1).maybeSingle();
    cash = fallback;
  }
  if (!cash) {
    const { data: fallback } = await admin.from("ledger_accounts").select("id").like("code", "11%").eq("currency_code", currency).limit(1).maybeSingle();
    cash = fallback;
  }
  if (!cash) {
    // Last resort: use any asset account for this currency
    const { data: fallback } = await admin.from("ledger_accounts").select("id").eq("account_type", "asset").eq("currency_code", currency).limit(1).maybeSingle();
    cash = fallback;
  }

  const j = crypto.randomUUID();
  const rows: any[] = [];
  if (cash) rows.push({ journal_id: j, account_id: cash.id, wallet_id: null, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Top-up via Flutterwave ${flwId}`, reference_type: "flw_topup", reference_id: ref });
  if (liab) rows.push({ journal_id: j, account_id: liab.id, wallet_id: wallet.id, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Top-up via Flutterwave ${flwId}`, reference_type: "flw_topup", reference_id: ref });
  if (rows.length === 2) {
    const { error } = await admin.from("ledger_entries").insert(rows);
    if (error) throw error;
  } else {
    // Liability account is missing — credit wallet directly via a single entry so the balance still updates
    if (liab) {
      const { error } = await admin.from("ledger_entries").insert([
        { journal_id: j, account_id: liab.id, wallet_id: wallet.id, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Top-up via Flutterwave ${flwId}`, reference_type: "flw_topup", reference_id: ref }
      ]);
      if (error) throw error;
    } else {
      throw new Error(`No liability ledger account found for ${currency} — cannot credit wallet`);
    }
  }
  return { wallet_id: wallet.id, already: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = user.id;

    const url = new URL(req.url);
    const txRef = url.searchParams.get("tx_ref") || url.searchParams.get("reference");
    const txId = url.searchParams.get("transaction_id") || url.searchParams.get("id") || url.searchParams.get("charge_id");
    if (!txRef && !txId) return new Response(JSON.stringify({ error: "tx_ref or transaction_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const verifyPath = txId
      ? `/transactions/${encodeURIComponent(txId)}/verify`
      : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef!)}`;
    const { ok, json } = await flwV3Fetch(verifyPath, { method: "GET" });
    if (!ok) {
      return new Response(JSON.stringify({ verified: false, error: json?.message || "Verification failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const d = json.data;
    const meta = d?.meta || {};
    if (meta.user_id && meta.user_id !== userId) {
      return new Response(JSON.stringify({ verified: false, error: "Transaction does not belong to you" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const status = String(d?.status || "").toLowerCase();
    if (status !== "successful" && status !== "success" && status !== "completed") {
      return new Response(JSON.stringify({ verified: false, status: d?.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amount = Number(d?.amount || 0);
    const currency = String(d?.currency || "").toUpperCase();
    const ref = String(d?.tx_ref || d?.reference || txRef || txId);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (meta?.type === "wallet_topup" || ref.startsWith("efm_topup_")) {
      const { already } = await creditWalletViaLedger(admin, userId, currency, amount, ref, String(d.id));
      if (!already) {
        await admin.from("notifications").insert({
          user_id: userId, title: "Wallet credited",
          message: `${currency} ${amount} added to your wallet.`, type: "transfer",
        });
      }
    }

    return new Response(JSON.stringify({ verified: true, status: d.status, amount, currency, charge_id: d.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-verify-payment V3 error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
