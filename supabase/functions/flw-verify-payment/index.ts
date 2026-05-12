// V4 charge verification: GET /charges/{id}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwFetch, isFlwSuccess } from "../_shared/flw-v4.ts";

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

  const { data: liab } = await admin.from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", currency).limit(1).maybeSingle();
  const { data: cash } = await admin.from("ledger_accounts").select("id").like("code", "11%").eq("currency_code", currency).limit(1).maybeSingle();
  const j = crypto.randomUUID();
  const rows: any[] = [];
  if (cash) rows.push({ journal_id: j, account_id: cash.id, wallet_id: null, currency_code: currency, debit_amount: amount, credit_amount: 0, description: `Top-up via Flutterwave ${flwId}`, reference_type: "flw_topup", reference_id: ref });
  if (liab) rows.push({ journal_id: j, account_id: liab.id, wallet_id: wallet.id, currency_code: currency, debit_amount: 0, credit_amount: amount, description: `Top-up via Flutterwave ${flwId}`, reference_type: "flw_topup", reference_id: ref });
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
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = claims.claims.sub as string;

    const url = new URL(req.url);
    const chargeId = url.searchParams.get("charge_id") || url.searchParams.get("transaction_id") || url.searchParams.get("id");
    if (!chargeId) return new Response(JSON.stringify({ error: "charge_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { ok, json } = await flwFetch(`/charges/${encodeURIComponent(chargeId)}`, { method: "GET" });
    if (!ok || !isFlwSuccess(json)) {
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
    const ref = String(d?.reference || d?.tx_ref || chargeId);

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
    console.error("flw-verify-payment V4 error", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
