import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  flovideConfigured,
  flovideCreateBeneficiary,
  flovideCreateTransaction,
  flovideListBalances,
  flovideListBanks,
} from "../_shared/flovide.ts";
import { normalizeNgCountry, resolveProviderBankCode } from "../_shared/ng-bank-codes.ts";
import { resolveCadInteracDestination } from "../_shared/cadInteracPayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const COUNTRY_BY_CURRENCY: Record<string, string> = {
  CAD: "CA",
  USD: "US",
  GBP: "GB",
  EUR: "EU",
  NGN: "NG",
  GHS: "GH",
  KES: "KE",
  UGX: "UG",
  XOF: "SN",
  ZAR: "ZA",
};

/** Flovide mobile-money bankCode values (from Live banks API). */
const MOMO_CODE: Record<string, string> = {
  "KES:mpesa": "SAFKEN",
  "KES:safaricom": "SAFKEN",
  "KES:m-pesa": "SAFKEN",
  "KES:airtel": "AIRKEN",
  "GHS:mtn": "MTN",
  "GHS:vodafone": "VOD",
  "GHS:telecel": "VOD",
  "GHS:airtel": "ATL",
  "GHS:airteltigo": "ATL",
  "UGX:mtn": "MTN",
  "UGX:airtel": "AIRTEL",
};

const DIAL: Record<string, string> = {
  KES: "254",
  GHS: "233",
  UGX: "256",
  NGN: "234",
};

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Recipient", last: "User" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function normalizePhone(phone: string, currency: string): string {
  let p = phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
  const dial = DIAL[currency] || "";
  if (dial) {
    if (p.startsWith("0")) p = p.slice(1);
    if (!p.startsWith(dial)) p = `${dial}${p}`;
  }
  return p;
}

function isMobileMethod(method: string, currency: string): boolean {
  if (["mpesa", "mobile_money", "mobile", "momo"].some((m) => method.includes(m))) return true;
  return ["KES", "GHS", "UGX"].includes(currency) && !method.includes("bank");
}

function resolveMomoCode(currency: string, network: string, fallback?: string): string {
  const key = `${currency}:${network}`.toLowerCase();
  if (MOMO_CODE[key]) return MOMO_CODE[key];
  if (fallback) return fallback;
  if (currency === "KES") return "SAFKEN";
  if (currency === "GHS") return "MTN";
  if (currency === "UGX") return "MTN";
  return "";
}

async function resolveMomoCodeLive(
  currency: string,
  country: string,
  network: string,
  fallback?: string,
): Promise<string> {
  const staticCode = resolveMomoCode(currency, network, fallback);
  try {
    const banks = await flovideListBanks(country || COUNTRY_BY_CURRENCY[currency], currency);
    const list = Array.isArray(banks.json?.data)
      ? banks.json.data as Array<{ code?: string; name?: string; bankCode?: string }>
      : [];
    const needles: string[] = [];
    const n = network.toLowerCase();
    if (n.includes("mpesa") || n.includes("safaricom") || n.includes("m-pesa")) needles.push("mpesa", "safaricom", "saf");
    if (n.includes("airtel")) needles.push("airtel", "air");
    if (n.includes("mtn")) needles.push("mtn");
    if (n.includes("vodafone") || n.includes("telecel")) needles.push("vodafone", "telecel", "voda");
    if (needles.length === 0) needles.push(n);

    const hit = list.find((b) => {
      const code = String(b.code || b.bankCode || "").toLowerCase();
      const name = String(b.name || "").toLowerCase();
      return needles.some((needle) => code.includes(needle) || name.includes(needle));
    });
    const live = String(hit?.code || hit?.bankCode || "").trim();
    if (live) return live;
  } catch {
    /* keep static */
  }
  return staticCode;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const internal = req.headers.get("x-internal-secret") || "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!service || internal !== service) return json({ error: "Unauthorized" }, 401);

  if (!flovideConfigured()) {
    return json({ success: false, error: "Flovide is not configured", rail: "flovide" }, 200);
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const transferId = String(body.transfer_id || "");
    if (!transferId) return json({ success: false, error: "transfer_id required", rail: "flovide" }, 200);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, service);
    const { data: transfer, error: tErr } = await admin.from("transfers").select("*").eq("id", transferId).maybeSingle();
    if (tErr || !transfer) {
      return json({ success: false, error: "Transfer not found", rail: "flovide" }, 200);
    }

    const currency = String(transfer.target_currency || transfer.source_currency || "").toUpperCase();
    const amount = Number(body.amount ?? transfer.target_amount ?? transfer.source_amount);
    const recipientName = String(body.recipient_name || transfer.recipient_name || "Recipient");
    const { first, last } = splitName(recipientName);
    const country = normalizeNgCountry(
      String(transfer.recipient_country || COUNTRY_BY_CURRENCY[currency] || ""),
      currency,
    ) || String(transfer.recipient_country || COUNTRY_BY_CURRENCY[currency] || "").toUpperCase();
    const method = String(body.network || transfer.payout_method || "bank").toLowerCase();

    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ success: false, error: "Invalid payout amount", rail: "flovide" }, 200);
    }

    // Prefer exact currency balance; for FX payouts Flovide may debit CAD/USD wallet.
    const balances = await flovideListBalances();
    const list = Array.isArray(balances.json?.data)
      ? balances.json.data as Array<{ id?: string; currency?: string; balance?: number }>
      : [];
    let wallet = list.find((b) => String(b.currency).toUpperCase() === currency);
    // Same-currency NGN: do NOT silently fund from CAD — that fails bank payouts.
    if (!wallet?.id && currency !== "NGN") {
      wallet = list.find((b) => String(b.currency).toUpperCase() === "CAD")
        || list.find((b) => String(b.currency).toUpperCase() === "USD")
        || list[0];
    }
    if (!wallet?.id) {
      const available = list.map((b) => `${b.currency}:${b.balance ?? "?"}`).join(", ") || "none";
      return json({
        success: false,
        error: `No Flovide ${currency} balance to fund this payout (available: ${available}). Top up Flovide ${currency} float.`,
        rail: "flovide",
      }, 200);
    }

    let beneficiaryBody: Record<string, unknown>;
    if (currency === "CAD" && (method.includes("interac") || String(transfer.recipient_email || "").includes("@"))) {
      const dest = resolveCadInteracDestination({
        recipient_account: transfer.recipient_account,
        recipient_phone: transfer.recipient_phone,
        recipient_email: transfer.recipient_email,
      });
      if (!dest.ok) {
        return json({
          success: false,
          error: dest.error,
          rail: "flovide",
          error_class: "hard",
          code: "missing_interac_contact",
        }, 200);
      }
      if (!dest.dest.email) {
        return json({
          success: false,
          error: "Flovide Interac payout requires recipient email; trying next rail",
          rail: "flovide",
          error_class: "retryable",
          code: "interac_email_required",
        }, 200);
      }
      const email = dest.dest.email;
      beneficiaryBody = {
        type: "individual",
        firstNames: first,
        lastName: last,
        transfer_method: "bank",
        bank: {
          country: "CA",
          currency: "CAD",
          interac_first_name: first,
          interac_last_name: last,
          interac_email: email,
        },
      };
    } else if (isMobileMethod(method, currency)) {
      const phone = normalizePhone(
        String(body.phone_number || transfer.recipient_phone || transfer.recipient_account || ""),
        currency,
      );
      if (!phone || phone.length < 9) {
        return json({ success: false, error: "Valid mobile number required", rail: "flovide" }, 200);
      }
      const net = String(body.network || transfer.payout_method || "mpesa").toLowerCase()
        .replace("mobile_money", currency === "KES" ? "mpesa" : "mtn");
      const bankCode = await resolveMomoCodeLive(
        currency,
        country || COUNTRY_BY_CURRENCY[currency] || "",
        net,
        String(transfer.recipient_bank_code || ""),
      );
      if (!bankCode) {
        return json({ success: false, error: `No Flovide MoMo code for ${currency}/${net}`, rail: "flovide" }, 200);
      }
      beneficiaryBody = {
        type: "individual",
        firstNames: first,
        lastName: last,
        transfer_method: "mobile",
        bank: {
          country: country || COUNTRY_BY_CURRENCY[currency],
          currency,
          accountHolder: recipientName,
          accountNumber: phone,
          bankCode,
        },
      };
    } else {
      const account = String(body.account_number || transfer.recipient_account || "").replace(/\D/g, "");
      const storedCode = String(body.bank_code || transfer.recipient_bank_code || "");
      const storedName = String(body.bank_name || transfer.recipient_bank_name || "");
      if (!account || !storedCode) {
        return json({ success: false, error: "Bank account and bank code required", rail: "flovide" }, 200);
      }

      // Re-resolve against Flovide's live bank list (code aliases + name match).
      let bankCode = storedCode;
      let resolvedName = storedName;
      try {
        const banksRes = await flovideListBanks(country || "NG", currency);
        const banks = (Array.isArray(banksRes.json?.data) ? banksRes.json.data as Array<Record<string, unknown>> : [])
          .map((b) => ({
            code: String(b.bank_code || b.bankCode || b.code || b.id || "").trim(),
            name: String(b.name || b.bankName || b.bank_name || "").trim(),
          }))
          .filter((b) => b.code && b.name);
        const hit = resolveProviderBankCode(banks, storedCode, storedName);
        if (hit.code) {
          bankCode = hit.code;
          if (hit.name) resolvedName = hit.name;
        }
        if (hit.matchedBy === "none" && banks.length > 0) {
          return json({
            success: false,
            error: `Bank code ${storedCode}${storedName ? ` (${storedName})` : ""} is not on Flovide’s NG bank list. Pick the bank again from the app.`,
            rail: "flovide",
            retryable: false,
          }, 200);
        }
      } catch {
        /* keep stored code */
      }

      beneficiaryBody = {
        type: "individual",
        firstNames: first,
        lastName: last,
        transfer_method: "bank",
        bank: {
          country: country || COUNTRY_BY_CURRENCY[currency] || "NG",
          currency,
          accountHolder: recipientName,
          accountNumber: account,
          bankCode,
          ...(resolvedName ? { bankName: resolvedName } : {}),
        },
      };
    }

    const bene = await flovideCreateBeneficiary(beneficiaryBody);
    if (!bene.ok) {
      return json({
        success: false,
        error: String(bene.json?.message || "Flovide beneficiary create failed"),
        provider: bene.json,
        rail: "flovide",
        retryable: true,
      }, 200);
    }
    const recipientId = String(bene.json?.data?.id || bene.json?.data?.recipient_id || "");
    if (!recipientId) {
      return json({ success: false, error: "Flovide returned no beneficiary id", provider: bene.json, rail: "flovide" }, 200);
    }

    const orderId = crypto.randomUUID();
    const reference = crypto.randomUUID();
    const txn = await flovideCreateTransaction({
      transaction_type: "payment",
      amount,
      recipient_id: recipientId,
      balance_id: wallet.id,
      order_id: orderId,
      reference,
    });

    if (!txn.ok) {
      return json({
        success: false,
        error: String(txn.json?.message || "Flovide payout failed"),
        provider: txn.json,
        rail: "flovide",
        retryable: true,
      }, 200);
    }

    const providerRef = String(txn.json?.data?.reference || txn.json?.data?.id || reference);
    await admin.from("transfers").update({
      provider_reference: providerRef,
      provider_charge_id: "rail:flovide",
      status: "processing",
    }).eq("id", transferId);

    await admin.from("flovide_transactions").insert({
      user_id: transfer.user_id,
      kind: "payout",
      status: "processing",
      amount,
      currency_code: currency,
      purpose: "transfer",
      transfer_id: transferId,
      reference: `EFN-FV-PAY-${String(transferId).slice(0, 8)}-${Date.now()}`,
      provider_reference: providerRef,
      provider_order_id: String(txn.json?.data?.order_id || orderId),
      raw_request: { ...beneficiaryBody, funding_balance: wallet },
      raw_response: txn.json,
    }).then(() => null, () => null);

    return json({
      success: true,
      rail: "flovide",
      reference: providerRef,
      queued: true,
      funding_currency: String(wallet.currency || "").toUpperCase(),
    });
  } catch (err) {
    console.error("flovide-payout error:", err);
    return json({
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      rail: "flovide",
      retryable: true,
    }, 200);
  }
});
