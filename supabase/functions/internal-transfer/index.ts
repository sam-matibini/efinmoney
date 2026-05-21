// In-network (eFinMoney user -> eFinMoney user) transfer.
// Same-currency = 1:1 ledger swap. Cross-currency = ledger swap using
// current fx_rates (effective_rate) with optional fee.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const sender_wallet_id: string | undefined = body.sender_wallet_id;
    const recipient_user_id: string | undefined = body.recipient_user_id;
    const amount: number = Number(body.amount);
    const note: string = String(body.note || "").slice(0, 280);

    if (!sender_wallet_id || !recipient_user_id || !(amount > 0)) {
      return json({ error: "sender_wallet_id, recipient_user_id and positive amount required" }, 400);
    }
    if (recipient_user_id === user.id) {
      return json({ error: "Cannot send to yourself" }, 400);
    }

    // Verify sender wallet ownership + active status
    const { data: senderWallet, error: swErr } = await admin
      .from("wallets")
      .select("id, user_id, currency_code, status")
      .eq("id", sender_wallet_id)
      .maybeSingle();
    if (swErr || !senderWallet) return json({ error: "Sender wallet not found" }, 404);
    if (senderWallet.user_id !== user.id) return json({ error: "Not your wallet" }, 403);
    if (senderWallet.status !== "active") return json({ error: `Wallet is ${senderWallet.status}` }, 400);

    // Verify recipient exists
    const { data: recipientProfile } = await admin
      .from("profiles")
      .select("user_id, full_name, email, efin_tag")
      .eq("user_id", recipient_user_id)
      .maybeSingle();
    if (!recipientProfile) return json({ error: "Recipient not found" }, 404);

    const fromCurrency = senderWallet.currency_code as string;

    // Resolve effective rate (same currency = 1)
    let effectiveRate = 1;
    let toCurrency = fromCurrency;
    let recipientCurrency: string | undefined = body.recipient_currency;
    if (recipientCurrency && recipientCurrency !== fromCurrency) {
      toCurrency = recipientCurrency;
      const { data: rateRow } = await admin
        .from("fx_rates")
        .select("effective_rate, rate")
        .eq("from_currency", fromCurrency)
        .eq("to_currency", toCurrency)
        .order("valid_from", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!rateRow) return json({ error: `No FX rate ${fromCurrency}->${toCurrency}` }, 400);
      effectiveRate = Number(rateRow.effective_rate || rateRow.rate);
      if (!(effectiveRate > 0)) return json({ error: "Invalid FX rate" }, 400);
    }

    // Find or create recipient wallet in destination currency
    let { data: recipientWallet } = await admin
      .from("wallets")
      .select("id, currency_code")
      .eq("user_id", recipient_user_id)
      .eq("currency_code", toCurrency)
      .maybeSingle();
    if (!recipientWallet) {
      const { data: newWallet, error: cwErr } = await admin
        .from("wallets")
        .insert({ user_id: recipient_user_id, currency_code: toCurrency, is_default: false })
        .select("id, currency_code")
        .single();
      if (cwErr || !newWallet) return json({ error: `Could not create recipient wallet: ${cwErr?.message}` }, 500);
      recipientWallet = newWallet;
    }

    // Check sender balance via RPC
    const { data: balance } = await admin.rpc("get_wallet_balance", { p_wallet_id: sender_wallet_id });
    if (Number(balance ?? 0) < amount) {
      return json({ error: "Insufficient balance" }, 400);
    }

    const targetAmount = +(amount * effectiveRate).toFixed(8);

    // Look up liability ledger accounts (21xx) per currency
    const { data: fromAcct } = await admin
      .from("ledger_accounts")
      .select("id")
      .like("code", "21%")
      .eq("currency_code", fromCurrency)
      .limit(1)
      .maybeSingle();
    const { data: toAcct } = await admin
      .from("ledger_accounts")
      .select("id")
      .like("code", "21%")
      .eq("currency_code", toCurrency)
      .limit(1)
      .maybeSingle();
    if (!fromAcct || !toAcct) {
      return json({ error: "Liability account missing for currency" }, 500);
    }

    // Insert transfer row first (status processing) so triggers can compute receipts/etc.
    const recipientName = recipientProfile.full_name
      || (recipientProfile.efin_tag ? `@${recipientProfile.efin_tag}` : recipientProfile.email)
      || "eFinMoney user";

    const { data: transfer, error: trErr } = await admin
      .from("transfers")
      .insert({
        sender_id: user.id,
        sender_wallet_id,
        recipient_name: recipientName,
        recipient_phone: null,
        recipient_account: recipientProfile.efin_tag ? `@${recipientProfile.efin_tag}` : recipientProfile.email,
        recipient_country: "EFM",
        transfer_type: "internal",
        payout_method: "efinmoney_wallet",
        source_currency: fromCurrency,
        target_currency: toCurrency,
        source_amount: amount,
        target_amount: targetAmount,
        exchange_rate: effectiveRate,
        fee_amount: 0,
        funding_source: "wallet",
        status: "processing",
      })
      .select("id")
      .single();
    if (trErr || !transfer) return json({ error: trErr?.message || "Could not create transfer" }, 500);

    // Build double-entry journal
    const journalId = crypto.randomUUID();
    const description = note || `eFinMoney transfer to ${recipientName}`;
    const entries = [
      {
        journal_id: journalId,
        account_id: fromAcct.id,
        wallet_id: sender_wallet_id,
        currency_code: fromCurrency,
        debit_amount: amount,
        credit_amount: 0,
        description,
        reference_type: "internal_transfer",
        reference_id: transfer.id,
        created_by: user.id,
      },
      {
        journal_id: journalId,
        account_id: toAcct.id,
        wallet_id: recipientWallet.id,
        currency_code: toCurrency,
        debit_amount: 0,
        credit_amount: targetAmount,
        description,
        reference_type: "internal_transfer",
        reference_id: transfer.id,
        created_by: user.id,
      },
    ];
    const { error: leErr } = await admin.from("ledger_entries").insert(entries);
    if (leErr) {
      await admin.from("transfers").update({ status: "failed", failure_reason: leErr.message }).eq("id", transfer.id);
      return json({ error: `Ledger error: ${leErr.message}` }, 500);
    }

    await admin
      .from("transfers")
      .update({ status: "completed", completed_at: new Date().toISOString(), provider_reference: journalId })
      .eq("id", transfer.id);

    // Notify recipient
    await admin.from("notifications").insert({
      user_id: recipient_user_id,
      title: "Money received",
      message: `You received ${targetAmount} ${toCurrency} from an eFinMoney user.`,
      type: "transfer",
      is_read: false,
    });

    return json({
      ok: true,
      transfer_id: transfer.id,
      journal_id: journalId,
      target_amount: targetAmount,
      target_currency: toCurrency,
      effective_rate: effectiveRate,
    });
  } catch (e: any) {
    console.error("internal-transfer error", e);
    return json({ error: e?.message || "Internal error" }, 500);
  }
});
