// V4 Payout / Transfer — POST /transfers
// Used by Send Money flow to disburse funds via mobile money or bank transfer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flwFetch, isFlwSuccess } from "../_shared/flw-v4.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const MM_NETWORK_MAP: Record<string, string> = {
  "KES:mpesa": "MPESA",
  "UGX:mtn": "MTN", "UGX:airtel": "AIRTEL",
  "GHS:mtn": "MTN", "GHS:airtel": "AIRTEL", "GHS:vodafone": "VODAFONE",
  "TZS:airtel": "AIRTEL", "TZS:vodafone": "VODAFONE", "TZS:tigo": "TIGO",
  "ZMW:mtn": "MTN", "ZMW:airtel": "AIRTEL", "ZMW:zamtel": "ZAMTEL",
  "RWF:mtn": "MTN", "RWF:airtel": "AIRTEL",
};

function normalizePhone(phone: string): string { return phone.replace(/\D/g, ""); }

function isTemporaryProviderSetupError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("ip whitelisting") || m.includes("whitelist") || m.includes("access this service");
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body: PayoutRequest = await req.json();
    const { transfer_id, phone_number, account_number, bank_code, amount, currency, network, recipient_name } = body;
    currentTransferId = transfer_id; currentUserId = user.id;
    if (!transfer_id || !amount || amount <= 0 || !currency || !network) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (currency === "NGN") {
      if (!account_number || !bank_code) {
        const reason = "Nigerian payout requires bank_code and 10-digit NUBAN account_number";
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
        await supabase.from("notifications").insert({ user_id: user.id, title: "Transfer failed — refunded", message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason, type: "error" });
        return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    } else if (!phone_number) {
      return new Response(JSON.stringify({ error: "phone_number required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: transfer, error: tErr } = await supabase.from("transfers").select("*").eq("id", transfer_id).eq("sender_id", user.id).single();
    if (tErr || !transfer) return new Response(JSON.stringify({ error: "Transfer not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const clientId = (Deno.env.get("FLW_CLIENT_ID") || "").trim();
    const clientSecret = (Deno.env.get("FLW_CLIENT_SECRET") || "").trim();
    if (!clientId || !clientSecret) {
      // Stub mode if not configured
      await supabase.from("transfers").update({ status: "processing", provider_reference: `STUB-${transfer_id.slice(0, 8)}` }).eq("id", transfer_id);
      await supabase.from("notifications").insert({ user_id: user.id, title: "Transfer queued", message: `Your ${currency} ${amount} transfer to ${recipient_name} is queued (Flutterwave not yet configured).`, type: "info" });
      return new Response(JSON.stringify({ success: true, stub: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const reference = `EFM-${transfer_id.slice(0, 8)}-${Date.now()}`;
    const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
    const callbackUrl = `https://${projectRef}.functions.supabase.co/flutterwave-webhook`;

    // Build V4 transfer payload
    let payload: Record<string, unknown>;
    if (currency === "NGN") {
      // Bank transfer (NGN) — uses real bank_code + 10-digit NUBAN from the transfer
      payload = {
        type: "bank_account",
        currency,
        amount: Math.round(amount * 100) / 100,
        reference,
        narration: `Transfer to ${recipient_name}`,
        callback_url: callbackUrl,
        beneficiary: {
          name: recipient_name,
          account_number: String(account_number).replace(/\D/g, ""),
          bank_code: String(bank_code),
          country: "NG",
        },
        meta: { transfer_id, network },
      };
    } else {
      const networkCode = MM_NETWORK_MAP[`${currency}:${network.toLowerCase()}`];
      if (!networkCode) {
        const reason = `Unsupported network ${network} for ${currency}`;
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
        await supabase.from("notifications").insert({ user_id: user.id, title: "Transfer failed — refunded", message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason, type: "error" });
        return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      payload = {
        type: "mobile_money",
        currency,
        amount: Math.round(amount * 100) / 100,
        reference,
        narration: `Transfer to ${recipient_name}`,
        callback_url: callbackUrl,
        beneficiary: {
          name: recipient_name,
          phone_number: normalizePhone(phone_number || ""),
          country: currency === "KES" ? "KE" : currency === "UGX" ? "UG" : currency === "GHS" ? "GH" : currency === "TZS" ? "TZ" : currency === "ZMW" ? "ZM" : currency === "RWF" ? "RW" : "",
          mobile_money: { network: networkCode },
        },
        meta: { transfer_id, network },
      };
    }

    console.log("FLW V4 transfer payload:", JSON.stringify(payload));
    const { ok, status, json } = await flwFetch("/transfers", { method: "POST", body: JSON.stringify(payload), idempotencyKey: reference });
    console.log("FLW V4 response:", status, JSON.stringify(json));

    if (!ok || !isFlwSuccess(json)) {
      const rawReason = json?.message || json?.error || (typeof json?.raw === "string" && /OriginTimeout|Gateway Timeout|Service unavailable/i.test(json.raw) ? "Gateway timeout from payout partner" : `HTTP ${status}`);
      const isGateway = [0, 408, 502, 503, 504].includes(status) || /OriginTimeout|Gateway Timeout|Service unavailable/i.test(String(rawReason));
      const reason = isGateway
        ? "Our payout partner is temporarily unavailable. Please try again in a few minutes."
        : rawReason;
      if (isTemporaryProviderSetupError(rawReason)) {
        await supabase.from("transfers").update({ status: "processing", provider_reference: `PENDING-${reference}`, failure_reason: null }).eq("id", transfer_id);
        await supabase.from("notifications").insert({ user_id: user.id, title: "Transfer queued", message: `Your ${currency} ${amount} transfer to ${recipient_name} is queued while the payout partner completes setup.`, type: "info" });
        return new Response(JSON.stringify({ success: true, queued: true, reference, provider_message: rawReason }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
      await supabase.from("notifications").insert({ user_id: user.id, title: "Transfer failed — refunded", message: rev.reversed ? `Your transfer to ${recipient_name} could not be sent — ${reason} Your wallet has been refunded.` : reason, type: "error" });
      return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed, transient: isGateway }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("transfers").update({ status: "processing", provider_reference: String(json.data?.id || json.data?.reference || reference) }).eq("id", transfer_id);
    await supabase.from("notifications").insert({ user_id: user.id, title: "Transfer initiated", message: `Your ${currency} ${amount} transfer to ${recipient_name} is being processed.`, type: "info" });
    return new Response(JSON.stringify({ success: true, reference, flw_id: json.data?.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("flutterwave-payout V4 error", msg);
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
