// V3 charge verification: GET /v3/transactions/verify_by_reference?tx_ref=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? "Verification failed");
}

function isWalletTopUp(meta: Record<string, unknown>, ref: string): boolean {
  if (meta?.type === "wallet_topup") return true;
  if (ref.startsWith("efm_topup_")) return true;
  if (ref.startsWith("topup-")) return true;
  return false;
}

async function creditWalletViaLedger(
  admin: ReturnType<typeof createClient>,
  userId: string,
  currency: string,
  amount: number,
  flwId: string,
  txRef: string,
  walletIdFromMeta?: string,
) {
  // Resolve wallet — prefer explicit wallet_id from FLW meta, else user's currency wallet
  let walletId = walletIdFromMeta || "";
  if (walletId) {
    const { data: w } = await admin.from("wallets").select("id, user_id, currency_code")
      .eq("id", walletId).maybeSingle();
    if (!w || w.user_id !== userId) walletId = "";
    else if (w.currency_code.toUpperCase() !== currency) walletId = "";
  }
  if (!walletId) {
    const { data: wallet } = await admin.from("wallets").select("id")
      .eq("user_id", userId).eq("currency_code", currency).maybeSingle();
    if (wallet) walletId = wallet.id;
  }
  if (!walletId) {
    const { data: nw, error: wErr } = await admin.from("wallets")
      .insert({ user_id: userId, currency_code: currency, is_default: false })
      .select("id").single();
    if (wErr || !nw) throw new Error(wErr?.message ?? "Could not create wallet");
    walletId = nw.id;
  }

  // Idempotency — use external_reference (text), same as flutterwave-webhook
  const idempotencyRef = flwId || txRef;
  const { data: existing } = await admin.from("ledger_entries").select("id")
    .eq("reference_type", "flw_topup").eq("external_reference", idempotencyRef).limit(1);
  if (existing && existing.length > 0) return { wallet_id: walletId, already: true };

  // Match flutterwave-webhook account lookup (proven working)
  const { data: asset } = await admin.from("ledger_accounts")
    .select("id").eq("currency_code", currency)
    .ilike("name", "Flutterwave Settlement%")
    .limit(1).maybeSingle();

  const { data: liab } = await admin.from("ledger_accounts")
    .select("id").like("code", "21%").eq("currency_code", currency)
    .ilike("name", "Customer Wallet Liability%")
    .limit(1).maybeSingle();

  if (!asset || !liab) {
    throw new Error(`Missing ledger accounts for ${currency} (asset=${!!asset}, liability=${!!liab})`);
  }

  const journalId = crypto.randomUUID();
  const desc = `Top-up via Flutterwave ${flwId}`;
  const { error } = await admin.from("ledger_entries").insert([
    {
      journal_id: journalId, account_id: asset.id, wallet_id: null, currency_code: currency,
      debit_amount: amount, credit_amount: 0, description: desc,
      reference_type: "flw_topup", external_reference: idempotencyRef,
    },
    {
      journal_id: journalId, account_id: liab.id, wallet_id: walletId, currency_code: currency,
      debit_amount: 0, credit_amount: amount, description: desc,
      reference_type: "flw_topup", external_reference: idempotencyRef,
    },
  ]);
  if (error) throw new Error(error.message ?? "Ledger insert failed");

  // Notification is best-effort — don't fail the credit if this errors
  try {
    await admin.from("notifications").insert({
      user_id: userId,
      title: "Wallet credited",
      message: `${currency} ${amount} added to your wallet.`,
      type: "transfer",
    });
  } catch (e) {
    console.warn("flw-verify-payment: notification insert failed", e);
  }

  return { wallet_id: walletId, already: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const url = new URL(req.url);
    const txRef = url.searchParams.get("tx_ref") || url.searchParams.get("reference");
    const txId = url.searchParams.get("transaction_id") || url.searchParams.get("id") || url.searchParams.get("charge_id");
    if (!txRef && !txId) {
      return new Response(JSON.stringify({ error: "tx_ref or transaction_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const verifyPath = txId
      ? `/transactions/${encodeURIComponent(txId)}/verify`
      : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef!)}`;
    const { ok, json } = await flwV3Fetch(verifyPath, { method: "GET" });
    if (!ok) {
      return new Response(JSON.stringify({ verified: false, error: json?.message || "Verification failed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const d = json?.data;
    if (!d) {
      return new Response(JSON.stringify({ verified: false, error: "No transaction data from Flutterwave" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = (d.meta || {}) as Record<string, unknown>;
    if (meta.user_id && meta.user_id !== userId) {
      return new Response(JSON.stringify({ verified: false, error: "Transaction does not belong to you" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const status = String(d.status || "").toLowerCase();
    if (status !== "successful" && status !== "success" && status !== "completed") {
      return new Response(JSON.stringify({ verified: false, status: d.status, error: `Payment status: ${d.status}` }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amount = Number(d.amount || 0);
    const currency = String(d.currency || "").toUpperCase();
    const ref = String(d.tx_ref || d.reference || txRef || txId);
    const flwId = String(d.id ?? txId ?? "");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let credited = false;
    if (isWalletTopUp(meta, ref)) {
      const walletIdFromMeta = meta.wallet_id ? String(meta.wallet_id) : undefined;
      const { already } = await creditWalletViaLedger(admin, userId, currency, amount, flwId, ref, walletIdFromMeta);
      credited = !already;
    }

    return new Response(JSON.stringify({
      verified: true,
      status: d.status,
      amount,
      currency,
      charge_id: d.id,
      credited,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("flw-verify-payment V3 error", err);
    return new Response(JSON.stringify({ error: errMsg(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
