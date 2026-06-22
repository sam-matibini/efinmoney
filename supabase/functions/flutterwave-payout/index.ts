// V3 Payout / Transfer — POST /v3/transfers
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwV3Fetch } from "../_shared/flw-v3.ts";
import {
  checkFlutterwaveLiquidity,
  queuePendingLiquidity,
} from "../_shared/treasury-worker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

interface PayoutRequest {
  transfer_id: string;
  phone_number?: string;
  account_number?: string;
  bank_code?: string;
  amount: number;
  currency: string;
  network: string;
  recipient_name: string;
}

// V3 mobile-money "account_bank" codes
const V3_MM_BANK: Record<string, string> = {
  "KES:mpesa": "MPS",
  "GHS:mtn": "MTN", "GHS:vodafone": "VOD", "GHS:airtel": "ATL",
  "UGX:mtn": "MTN", "UGX:airtel": "ATL",
  "TZS:airtel": "ATL", "TZS:vodafone": "VOD", "TZS:tigo": "TIGO",
  "ZMW:mtn": "MTN", "ZMW:airtel": "ATL", "ZMW:zamtel": "ZAMTEL",
  "RWF:mtn": "MTN", "RWF:airtel": "ATL",
};

// Flutterwave V3 requires `destination_branch_code` for payouts to some
// corridors (Uganda UGX, Tanzania TZS). Without it, the transfer is queued
// and then fails asynchronously with "branchcode not provided" on the webhook.
// Keyed by `${currency}:${account_bank}` (account_bank already mapped above for
// mobile money, or raw bank code for bank rails).
const V3_BRANCH_CODES: Record<string, string> = {
  "UGX:MTN": "UG010101",
  "UGX:ATL": "UG020202",
  "TZS:AIRTEL": "TZ010101",
  "TZS:ATL": "TZ010101",
  "TZS:VODACOM": "TZ020202",
  "TZS:VOD": "TZ020202",
  "TZS:TIGO": "TZ030303",
};

// Currencies that always require a branch code regardless of rail
const BRANCH_CODE_REQUIRED_CURRENCIES = new Set(["UGX", "TZS"]);

function normalizePhone(phone: string): string { return phone.replace(/\D/g, ""); }

function isTemporaryProviderSetupError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("ip whitelisting") || m.includes("whitelist") || m.includes("access this service");
}

function isProviderBalanceError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("insufficient funds in customer wallet") ||
         m.includes("insufficient balance") ||
         (m.includes("insufficient") && m.includes("wallet"));
}

async function reverseTransferLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: existing } = await supabase.from("ledger_entries").select("id").eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing && existing.length > 0) return { reversed: false, reason: "already_reversed" };
  const { data: originals, error } = await supabase.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (error || !originals?.length) return { reversed: false, reason: "no_entries" };
  const j = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: j, account_id: o.account_id, wallet_id: o.wallet_id, currency_code: o.currency_code,
    debit_amount: o.credit_amount, credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal", reference_id: transferId,
  }));
  const { error: insErr } = await supabase.from("ledger_entries").insert(rows);
  if (insErr) return { reversed: false, reason: insErr.message };
  return { reversed: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let currentTransferId: string | null = null;
  let currentUserId: string | null = null;

  try {
    const internalSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isInternal = internalSecret && req.headers.get("x-internal-secret") === internalSecret;
    let userId: string | null = null;

    if (isInternal) {
      // Treasury worker / execute-transfer internal retry
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      userId = user.id;
    }

    const body: PayoutRequest = await req.json();
    const { transfer_id, phone_number, account_number, bank_code, amount, currency, network, recipient_name } = body;
    currentTransferId = transfer_id;
    currentUserId = userId;
    if (!transfer_id || !amount || amount <= 0 || !currency) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const transferQ = supabase.from("transfers").select("*").eq("id", transfer_id);
    const { data: transfer, error: tErr } = isInternal
      ? await transferQ.single()
      : await transferQ.eq("sender_id", userId!).single();
    if (tErr || !transfer) return new Response(JSON.stringify({ error: "Transfer not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const senderId = transfer.sender_id as string;
    currentUserId = senderId;

    const hasBankRail = !!(account_number && bank_code);
    if (currency === "NGN" && !hasBankRail) {
      const reason = "Nigerian payout requires bank_code and 10-digit NUBAN account_number";
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
      await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer failed — refunded", message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason, type: "error" });
      return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!hasBankRail && !phone_number) {
      return new Response(JSON.stringify({ error: "phone_number required for mobile money payout" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!Deno.env.get("FLW_SECRET_KEY")) {
      // Stub mode if not configured
      await supabase.from("transfers").update({ status: "processing", provider_reference: `STUB-${transfer_id.slice(0, 8)}` }).eq("id", transfer_id);
      await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer queued", message: `Your ${currency} ${amount} transfer to ${recipient_name} is queued (Flutterwave not yet configured).`, type: "info" });
      return new Response(JSON.stringify({ success: true, stub: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Preflight liquidity — queue instead of failing when FLW balance is low
    const liq = await checkFlutterwaveLiquidity(supabase, amount, currency, { requireBuffer: false });
    if (!liq.sufficient) {
      const internalReason = `FLW ${liq.debitCurrency} shortfall (available ${liq.available}, need ${liq.needed})`;
      await queuePendingLiquidity(supabase, transfer_id, senderId, internalReason);
      return new Response(JSON.stringify({
        success: true,
        queued: true,
        pending_liquidity: true,
        code: "pending_liquidity",
        available: liq.available,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reference = `EFM-${transfer_id.slice(0, 8)}-${Date.now()}`;
    const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
    const callbackUrl = `https://${projectRef}.functions.supabase.co/flutterwave-webhook`;

    // Bank rail = caller provided both bank_code and account_number
    // (NGN NUBAN, GHS branch code, or any other Flutterwave-supported bank corridor).
    const isBankRail = !!(bank_code && account_number);
    const debitCurrency = Deno.env.get("FLW_MERCHANT_CURRENCY") || "NGN";
    let payload: Record<string, unknown>;
    if (isBankRail) {
      payload = {
        account_bank: String(bank_code),
        account_number: String(account_number).replace(/\D/g, ""),
        amount: Math.round(amount * 100) / 100,
        narration: `Transfer to ${recipient_name}`,
        currency,
        reference,
        callback_url: callbackUrl,
        debit_currency: debitCurrency,
        beneficiary_name: recipient_name,
        meta: [{ transfer_id, network: network || "bank" }],
      };
      const branch = V3_BRANCH_CODES[`${currency}:${String(bank_code)}`];
      if (branch) (payload as Record<string, unknown>).destination_branch_code = branch;
    } else {
      const bank = V3_MM_BANK[`${currency}:${network.toLowerCase()}`];
      if (!bank) {
        const reason = `Unsupported network ${network} for ${currency}`;
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
        await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer failed — refunded", message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason, type: "error" });
        return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      payload = {
        account_bank: bank,
        account_number: normalizePhone(phone_number || ""),
        amount: Math.round(amount * 100) / 100,
        narration: `Transfer to ${recipient_name}`,
        currency,
        reference,
        callback_url: callbackUrl,
        debit_currency: debitCurrency,
        beneficiary_name: recipient_name,
        meta: [{ transfer_id, network }],
      };
      const branch = V3_BRANCH_CODES[`${currency}:${bank}`];
      if (branch) (payload as Record<string, unknown>).destination_branch_code = branch;
    }

    // Hard-stop if the destination requires a branch code we don't know.
    if (BRANCH_CODE_REQUIRED_CURRENCIES.has(currency) && !(payload as Record<string, unknown>).destination_branch_code) {
      const reason = `Missing branch code for ${currency} payout — network not yet supported`;
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
      await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer failed — refunded", message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason, type: "error" });
      return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { ok, status, json } = await flwV3Fetch("/transfers", { method: "POST", body: JSON.stringify(payload), timeoutMs: 25_000 });

    if (!ok) {
      const rawReason = json?.message || json?.error || `HTTP ${status}`;
      const isGateway = [0, 408, 502, 503, 504].includes(status);
      const reason = isGateway
        ? "Our payout partner is temporarily unavailable. Please try again in a few minutes."
        : rawReason;
      if (isTemporaryProviderSetupError(rawReason)) {
        const opsReason = `Provider setup required: enable IP whitelisting on Flutterwave for ${currency} payouts. Funds returned. (raw: ${rawReason})`;
        const userReason = `${currency} payouts are temporarily unavailable. Your funds have been returned to your wallet — please try again shortly.`;
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: opsReason.slice(0, 500) }).eq("id", transfer_id);
        await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer failed — refunded", message: rev.reversed ? userReason : userReason.replace("Your funds have been returned to your wallet — please try again shortly.", "Please contact support."), type: "error" });
        return new Response(JSON.stringify({ success: false, error: userReason, code: "provider_setup_required", refunded: rev.reversed, provider_message: rawReason }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (isProviderBalanceError(rawReason)) {
        const internalReason = `FLW balance error: ${rawReason}`;
        await queuePendingLiquidity(supabase, transfer_id, senderId, internalReason);
        return new Response(JSON.stringify({
          success: true,
          queued: true,
          pending_liquidity: true,
          code: "pending_liquidity",
          provider_message: rawReason,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
      await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer failed — refunded", message: rev.reversed ? `Your transfer to ${recipient_name} could not be sent — ${reason} Your wallet has been refunded.` : reason, type: "error" });
      return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed, transient: isGateway }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("transfers").update({ status: "processing", provider_reference: String(json.data?.id || json.data?.reference || reference) }).eq("id", transfer_id);
    await supabase.from("notifications").insert({ user_id: senderId, title: "Transfer initiated", message: `Your ${currency} ${amount} transfer to ${recipient_name} is being processed.`, type: "info" });
    return new Response(JSON.stringify({ success: true, reference, flw_id: json.data?.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("flutterwave-payout V3 error", msg);
    if (currentTransferId) {
      try {
        const rev = await reverseTransferLedger(supabase, currentTransferId);
        await supabase.from("transfers").update({ status: "failed", failure_reason: msg.slice(0, 500) }).eq("id", currentTransferId);
        if (currentUserId) await supabase.from("notifications").insert({ user_id: currentUserId, title: "Transfer failed — refunded", message: (rev.reversed ? "Refunded to your wallet. " : "") + msg.slice(0, 250), type: "error" });
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
