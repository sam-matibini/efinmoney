import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";

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

const FINCRA_MM_CODE: Record<string, string> = {
  "KES:mpesa": "MPESA",
  "GHS:mtn": "MTN",
  "GHS:vodafone": "VODAFONE",
  "GHS:airtel": "AIRTELTIGO",
  "UGX:mtn": "MTN",
  "UGX:airtel": "AIRTEL",
  "TZS:airtel": "AIRTEL",
  "TZS:vodafone": "VODACOM",
  "TZS:tigo": "TIGO",
  "ZMW:mtn": "MTN",
  "ZMW:airtel": "AIRTEL",
  "ZMW:zamtel": "ZAMTEL",
  "RWF:mtn": "MTN",
  "RWF:airtel": "AIRTEL",
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Recipient", lastName: "User" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizePhone(phone: string, currency: string): string {
  let p = phone.replace(/[^\d+]/g, "");
  if (!p.startsWith("+")) {
    const cc: Record<string, string> = { NGN: "+234", KES: "+254", GHS: "+233", UGX: "+256", TZS: "+255", ZMW: "+260", RWF: "+250" };
    const prefix = cc[currency] || "+";
    if (p.startsWith("0")) p = p.slice(1);
    p = `${prefix}${p}`;
  }
  return p;
}

async function reverseTransferLedger(supabase: ReturnType<typeof createClient>, transferId: string) {
  const { data: existing } = await supabase.from("ledger_entries").select("id")
    .eq("reference_type", "transfer_reversal").eq("reference_id", transferId).limit(1);
  if (existing && existing.length > 0) return { reversed: false, reason: "already_reversed" };
  const { data: originals, error } = await supabase.from("ledger_entries")
    .select("account_id, wallet_id, currency_code, debit_amount, credit_amount, description, created_by")
    .eq("reference_type", "transfer").eq("reference_id", transferId);
  if (error || !originals?.length) return { reversed: false, reason: error?.message || "no_entries" };
  const journalId = crypto.randomUUID();
  const rows = originals.map((o) => ({
    journal_id: journalId, account_id: o.account_id, wallet_id: o.wallet_id, currency_code: o.currency_code,
    debit_amount: o.credit_amount, credit_amount: o.debit_amount,
    description: `REVERSAL: ${o.description ?? ""}`.slice(0, 500),
    reference_type: "transfer_reversal", reference_id: transferId, created_by: o.created_by,
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

    if (!isInternal) {
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

    const cfg = getFincraConfig();
    if (!cfg.secretKey || !cfg.businessId) {
      await supabase.from("transfers").update({ status: "processing", provider_reference: `STUB-FINCRA-${transfer_id.slice(0, 8)}` }).eq("id", transfer_id);
      return new Response(JSON.stringify({ success: true, stub: true, message: "Fincra not configured" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const hasBankRail = !!(account_number && bank_code);
    if (currency === "NGN" && !hasBankRail) {
      const reason = "Nigerian payout requires bank_code and 10-digit NUBAN account_number";
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
      return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!hasBankRail && !phone_number) {
      return new Response(JSON.stringify({ error: "phone_number required for mobile money payout" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { firstName, lastName } = splitName(recipient_name || transfer.recipient_name || "Recipient");
    const customerReference = transfer_id;
    const ccy = currency.toUpperCase();

    let payload: Record<string, unknown>;
    if (hasBankRail) {
      payload = {
        business: cfg.businessId,
        sourceCurrency: ccy,
        destinationCurrency: ccy,
        amount: String(Math.round(amount * 100) / 100),
        description: `eFinMoney transfer to ${recipient_name}`,
        paymentDestination: "bank_account",
        customerReference,
        beneficiary: {
          firstName,
          lastName,
          type: "individual",
          accountHolderName: recipient_name,
          accountNumber: String(account_number).replace(/\D/g, ""),
          bankCode: String(bank_code),
        },
      };
    } else {
      const mmCode = FINCRA_MM_CODE[`${ccy}:${network.toLowerCase()}`];
      if (!mmCode) {
        const reason = `Unsupported network ${network} for ${ccy} on Fincra`;
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
        return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      payload = {
        business: cfg.businessId,
        sourceCurrency: ccy,
        destinationCurrency: ccy,
        amount: String(Math.round(amount * 100) / 100),
        description: `eFinMoney transfer to ${recipient_name}`,
        paymentDestination: "mobile_money_wallet",
        customerReference,
        beneficiary: {
          firstName,
          lastName,
          type: "individual",
          phone: normalizePhone(phone_number || "", ccy),
          mobileMoneyCode: mmCode,
        },
      };
    }

    const { ok, status, json } = await fincraFetch("/disbursements/payouts", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!ok) {
      const reason = String(json?.error || json?.message || `HTTP ${status}`);
      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: senderId,
        title: "Transfer failed — refunded",
        message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason,
        type: "error",
      });
      return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const pdata = (json?.data ?? {}) as Record<string, unknown>;
    const providerRef = String(pdata.reference || pdata.id || customerReference);
    await supabase.from("transfers").update({ status: "processing", provider_reference: providerRef }).eq("id", transfer_id);
    await supabase.from("notifications").insert({
      user_id: senderId,
      title: "Transfer initiated",
      message: `Your ${ccy} ${amount} transfer to ${recipient_name} is being processed via Fincra.`,
      type: "info",
    });

    return new Response(JSON.stringify({ success: true, reference: providerRef, status: pdata.status }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("fincra-payout error", msg);
    if (currentTransferId) {
      try {
        const rev = await reverseTransferLedger(supabase, currentTransferId);
        await supabase.from("transfers").update({ status: "failed", failure_reason: msg.slice(0, 500) }).eq("id", currentTransferId);
        if (currentUserId) {
          await supabase.from("notifications").insert({
            user_id: currentUserId,
            title: "Transfer failed — refunded",
            message: (rev.reversed ? "Refunded to your wallet. " : "") + msg.slice(0, 250),
            type: "error",
          });
        }
      } catch { /* ignore */ }
    }
    return new Response(JSON.stringify({ success: false, error: msg }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
