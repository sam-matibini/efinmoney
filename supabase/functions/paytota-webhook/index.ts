import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getPaytotaPurchase,
  isPaytotaFailedStatus,
  isPaytotaPaidStatus,
} from "../_shared/paytota.ts";
import { sendTopupEmail } from "../_shared/topup-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SETTLEMENT_BY_CURRENCY: Record<string, string> = {
  USD: "1270",
  CAD: "1271",
  EUR: "1272",
  GBP: "1273",
  UGX: "1280",
  KES: "1281",
  RWF: "1282",
};

const LIABILITY_BY_CURRENCY: Record<string, string> = {
  USD: "2100",
  CAD: "2101",
  EUR: "2104",
  GBP: "2105",
  KES: "2110",
  UGX: "2111",
  RWF: "2112",
};

type SupabaseAdmin = ReturnType<typeof createClient>;
type PaytotaTxn = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function findTxn(
  supabase: SupabaseAdmin,
  purchaseId?: string,
  reference?: string,
  txnId?: string,
) {
  if (txnId) {
    const r = await supabase.from("paytota_payin_transactions").select("*").eq("id", txnId).maybeSingle();
    if (r.data) return r.data;
  }
  if (purchaseId) {
    const r = await supabase.from("paytota_payin_transactions").select("*").eq("purchase_id", purchaseId).maybeSingle();
    if (r.data) return r.data;
  }
  if (reference) {
    const r = await supabase.from("paytota_payin_transactions").select("*").eq("reference", reference).maybeSingle();
    if (r.data) return r.data;
  }
  return null;
}

async function completePaytotaCollection(
  supabase: SupabaseAdmin,
  txn: PaytotaTxn,
  purchaseId: string,
  eventPayload: Record<string, unknown>,
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  if (txn.status === "completed") return { ok: true, duplicate: true };

  await supabase.from("paytota_payin_transactions").update({ last_event: eventPayload }).eq("id", txn.id);

  if (!txn.target_wallet_id) return { ok: false, error: "Collection has no target wallet" };

  const creditCurrency = String(txn.credit_currency ?? txn.currency).toUpperCase();
  const creditAmount = txn.credit_amount != null ? Number(txn.credit_amount) : Number(txn.amount);
  const checkoutCurrency = String(txn.checkout_currency ?? txn.currency).toUpperCase();
  const checkoutAmount = txn.checkout_amount != null ? Number(txn.checkout_amount) : Number(txn.amount);

  const idempotencyRef = purchaseId || String(txn.reference);

  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "paytota_pay_topup")
    .eq("external_reference", idempotencyRef)
    .limit(1);
  if (existing?.length) {
    await supabase.from("paytota_payin_transactions").update({ status: "completed" }).eq("id", txn.id);
    return { ok: true, duplicate: true };
  }

  const assetCode = SETTLEMENT_BY_CURRENCY[checkoutCurrency];
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
      reference_type: "paytota_pay_topup",
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
      reference_type: "paytota_pay_topup",
      reference_id: txn.id,
      external_reference: idempotencyRef,
      created_by: txn.user_id,
    },
  ]);

  if (leErr) return { ok: false, error: "Ledger post failed" };

  await supabase.from("paytota_payin_transactions").update({
    status: "completed",
    provider_reference: idempotencyRef,
    purchase_id: purchaseId || txn.purchase_id,
  }).eq("id", txn.id);

  const symbol = creditCurrency === "GBP" ? "£"
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

async function syncFromProvider(
  supabase: SupabaseAdmin,
  txn: PaytotaTxn,
): Promise<{ ok: boolean; status: string; error?: string }> {
  const purchaseId = String(txn.purchase_id ?? "").trim();
  if (!purchaseId) return { ok: false, status: String(txn.status), error: "No purchase id" };

  const { ok, json } = await getPaytotaPurchase(purchaseId);
  if (!ok) return { ok: false, status: String(txn.status), error: "Could not fetch purchase" };

  const status = json.status ?? (json as { payment_status?: string }).payment_status;
  if (isPaytotaPaidStatus(status)) {
    const result = await completePaytotaCollection(supabase, txn, purchaseId, json);
    return { ok: result.ok, status: result.ok ? "completed" : String(txn.status), error: result.error };
  }
  if (isPaytotaFailedStatus(status)) {
    await supabase.from("paytota_payin_transactions").update({
      status: "failed",
      failure_reason: String((json as { error_message?: string }).error_message || status),
      last_event: json,
    }).eq("id", txn.id);
    return { ok: true, status: "failed" };
  }
  return { ok: true, status: String(txn.status) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Authenticated confirm / poll: POST { purchase_id | transaction_id }
    if (req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      const purchaseId = String(body.purchase_id ?? body.purchaseId ?? "").trim();
      const txnId = String(body.transaction_id ?? body.transactionId ?? "").trim();
      const reference = String(body.reference ?? "").trim();
      const walletId = String(body.target_wallet_id ?? body.wallet_id ?? body.walletId ?? "").trim();

      // Webhook-style body from Paytota success_callback (may include id / status without auth)
      const looksLikeWebhook = Boolean(
        (body.id || body.purchase_id || body.reference) && (body.status || body.payment_status),
      ) && !authHeader?.startsWith("Bearer ");

      if (looksLikeWebhook || (!authHeader && (purchaseId || reference))) {
        const webhookPurchaseId = String(body.id ?? body.purchase_id ?? purchaseId).trim();
        const webhookRef = String(body.reference ?? reference).trim();
        const txn = await findTxn(supabase, webhookPurchaseId, webhookRef);
        if (!txn) {
          console.warn("paytota-webhook: txn not found", { webhookPurchaseId, webhookRef });
          return json({ ok: true, ignored: true });
        }
        const status = body.status ?? body.payment_status;
        if (isPaytotaFailedStatus(status)) {
          await supabase.from("paytota_payin_transactions").update({
            status: "failed",
            failure_reason: String(status),
            last_event: body,
          }).eq("id", txn.id);
          return json({ ok: true, status: "failed" });
        }
        if (isPaytotaPaidStatus(status) || !status) {
          const result = await completePaytotaCollection(
            supabase,
            txn,
            webhookPurchaseId || String(txn.purchase_id ?? ""),
            body,
          );
          if (!result.ok && !isPaytotaPaidStatus(status)) {
            // Callback without clear status — sync from provider
            const synced = await syncFromProvider(supabase, txn);
            return json({ ok: synced.ok, status: synced.status, error: synced.error });
          }
          return json({ ok: result.ok, status: result.ok ? "completed" : "error", error: result.error });
        }
        await supabase.from("paytota_payin_transactions").update({ last_event: body }).eq("id", txn.id);
        return json({ ok: true, status: String(txn.status) });
      }

      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: userData } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!userData?.user?.id) return json({ error: "Unauthorized" }, 401);

      let txn = await findTxn(supabase, purchaseId || undefined, reference || undefined, txnId || undefined);

      // Return URL often only has walletId (sessionStorage / purchase_id missing)
      if (!txn && walletId) {
        const { data: byWallet } = await supabase
          .from("paytota_payin_transactions")
          .select("*")
          .eq("user_id", userData.user.id)
          .eq("target_wallet_id", walletId)
          .in("status", ["pending", "processing", "completed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        txn = byWallet;
      }

      if (!txn || txn.user_id !== userData.user.id) {
        return json({
          error: "Payment session not found. If MoMo already deducted, refresh your wallet or contact support with the Paytota reference.",
          code: "txn_not_found",
        }, 404);
      }

      if (txn.status === "completed" || txn.status === "failed") {
        return json({
          ok: true,
          status: txn.status,
          transaction_id: txn.id,
          credit_amount: txn.credit_amount,
          credit_currency: txn.credit_currency,
        });
      }

      const synced = await syncFromProvider(supabase, txn);
      const refreshed = await findTxn(supabase, undefined, undefined, String(txn.id));
      return json({
        ok: synced.ok,
        status: refreshed?.status ?? synced.status,
        transaction_id: txn.id,
        credit_amount: refreshed?.credit_amount ?? txn.credit_amount,
        credit_currency: refreshed?.credit_currency ?? txn.credit_currency,
        error: synced.error,
      });
    }

    // GET health / optional query sync
    if (req.method === "GET") {
      const url = new URL(req.url);
      const purchaseId = String(url.searchParams.get("purchase_id") ?? "").trim();
      const reference = String(url.searchParams.get("reference") ?? "").trim();
      if (!purchaseId && !reference) {
        return json({ ok: true, endpoint: "paytota-webhook" });
      }
      const txn = await findTxn(supabase, purchaseId || undefined, reference || undefined);
      if (!txn) return json({ ok: false, error: "Not found" }, 404);
      const synced = await syncFromProvider(supabase, txn);
      return json({ ok: synced.ok, status: synced.status, error: synced.error });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (err) {
    console.error("paytota-webhook error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
