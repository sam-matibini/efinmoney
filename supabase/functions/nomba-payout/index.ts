import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  authorizeNombaGlobalTransfer,
  createNombaDomesticBankTransfer,
  fetchNombaExchangeRates,
  listNombaInstitutions,
  nombaApiConfigured,
} from "../_shared/nomba-api.ts";
import {
  classifyNombaPayout,
  momoNetworkHints,
  nombaBankPaymentMethod,
  normalizeNombaCountry,
  pickNombaInstitution,
} from "../_shared/nomba-payout-corridors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Pull a usable source→destination rate out of Nomba's exchange-rates payload. */
function extractNombaRate(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as Record<string, unknown>).data ?? payload;
  const rows: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.rates)
    ? ((data as Record<string, unknown>).rates as unknown[])
    : [data];
  const parse = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
    const s = String(v ?? "").replace(/[^0-9.]/g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    // Nomba docs return midRate/askRate/bidRate (often "$1.13" strings).
    for (const key of ["midRate", "askRate", "bidRate", "rate", "exchangeRate", "sellRate", "buyRate", "value"]) {
      const n = parse(r[key]);
      if (n) return n;
    }
  }
  return null;
}

const DIAL_BY_COUNTRY: Record<string, string> = {
  NG: "234",
  KE: "254",
  GH: "233",
  UG: "256",
  TZ: "255",
  RW: "250",
  ZM: "260",
  SN: "221",
  CI: "225",
  CM: "237",
  GA: "241",
  NE: "227",
  ET: "251",
  CD: "243",
};

const CURRENCY_DEFAULT_NETWORK: Record<string, string> = {
  KES: "mpesa",
  GHS: "mtn",
  UGX: "mtn",
  TZS: "airtel",
  RWF: "mtn",
  XOF: "orange",
  XAF: "mtn",
  ETB: "mpesa",
  CDF: "mpesa",
  USD: "mpesa",
};

const PAYOUT_METHOD_TO_NETWORK: Record<string, string> = {
  mtn_mobile: "mtn",
  airtel_money: "airtel",
  airteltigo_money: "airtel",
  zamtel_money: "zamtel",
  vodafone_cash: "vodafone",
  vodafone_money: "vodafone",
  tigo_pesa: "tigo",
  mpesa: "mpesa",
  orange_money: "orange",
};

function resolveNetwork(payoutMethod: string | null | undefined, currency: string): string {
  if (payoutMethod && PAYOUT_METHOD_TO_NETWORK[payoutMethod]) {
    return PAYOUT_METHOD_TO_NETWORK[payoutMethod];
  }
  const lower = (payoutMethod ?? "").toLowerCase().trim();
  if (["mtn", "airtel", "zamtel", "mpesa", "vodafone", "tigo", "orange", "wave", "moov"].includes(lower)) {
    return lower;
  }
  return CURRENCY_DEFAULT_NETWORK[currency] || "mpesa";
}

function normalizePhone(phone: string, country: string): string {
  let digits = phone.replace(/\D/g, "");
  const dial = DIAL_BY_COUNTRY[country] || "";
  if (digits.startsWith("0") && !(dial && digits.startsWith(dial))) digits = digits.slice(1);
  if (dial && digits.startsWith(dial + dial)) digits = dial + digits.slice(dial.length * 2);
  if (dial && !digits.startsWith(dial)) digits = `${dial}${digits}`;
  return digits;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isTerminalSuccess(status: string): boolean {
  const s = status.toUpperCase().trim();
  // Exact / prefix matches only — never .includes("SUCCESS") (matches UNSUCCESSFUL).
  return s === "SUCCESS"
    || s === "SUCCESSFUL"
    || s === "COMPLETED"
    || s === "SETTLED"
    || s === "PAYMENT_SUCCESSFUL";
}

function isPendingStatus(status: string): boolean {
  const s = status.toUpperCase().trim();
  return s === "PROCESSING"
    || s === "PENDING"
    || s === "PENDING_BILLING"
    || s === "INITIATED"
    || s.startsWith("PENDING");
}

/** Nomba often returns status=PROCESSING with coreStatus=PAYMENT_SUCCESSFUL. */
function nombaRawIndicatesDelivered(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const json = raw as Record<string, unknown>;
  const data = (json.data && typeof json.data === "object")
    ? json.data as Record<string, unknown>
    : json;
  const core = String(data.coreStatus || "").toUpperCase();
  const pretty = String(data.prettyStatus || "").toUpperCase().trim();
  const st = String(data.status || "").toUpperCase().trim();
  if (core === "PAYMENT_SUCCESSFUL" || core.includes("PAYMENT_SUCCESS")) return true;
  if (pretty === "SUCCESSFUL" || pretty === "SUCCESS" || pretty === "COMPLETED") return true;
  if (st === "COMPLETED" || st === "SUCCESS" || st === "SUCCESSFUL" || st === "SETTLED") return true;
  return false;
}

/** Nomba Global Payout requires first + last name on receiverName. */
function ensureNombaReceiverName(raw: string): string {
  const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 6).join(" ");
  if (parts.length === 1) return `${parts[0]} Beneficiary`;
  return "Wallet Beneficiary";
}

/** Pull Nomba's real error text (they often return { errors: [...] } with no description). */
function nombaFailureReason(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const j = json as Record<string, unknown>;
  if (Array.isArray(j.errors) && j.errors.length) {
    return j.errors.map((e) => String(e)).join("; ").slice(0, 500);
  }
  const data = j.data && typeof j.data === "object" ? j.data as Record<string, unknown> : null;
  if (data && Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e) => String(e)).join("; ").slice(0, 500);
  }
  return String(j.description || j.message || data?.message || fallback).slice(0, 500);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const expectedSecret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!expectedSecret || req.headers.get("x-internal-secret") !== expectedSecret) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const transfer_id = String(body.transfer_id || "").trim();
    if (!transfer_id) return json({ success: false, error: "transfer_id required" }, 400);

    if (!nombaApiConfigured()) {
      return json({
        success: false,
        error: "Nomba API not configured (NOMBA_CLIENT_ID/SECRET/ACCOUNT_ID)",
        code: "not_configured",
        rail: "nomba",
      }, 500);
    }

    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .single();
    if (tErr || !transfer) return json({ success: false, error: "Transfer not found" }, 404);

    const targetCurrency = String(transfer.target_currency || "NGN").toUpperCase();
    const sourceCurrencyWallet = String(transfer.source_currency || targetCurrency).toUpperCase();
    const payoutMethod = String(transfer.payout_method || body.network || "").trim();
    const country = normalizeNombaCountry(
      String(transfer.recipient_country || body.recipient_country || ""),
      targetCurrency,
    );
    const kind = classifyNombaPayout({
      currency: targetCurrency,
      country,
      method: payoutMethod || (targetCurrency === "NGN" ? "bank" : "mobile_money"),
    });

    if (kind === "unsupported") {
      return json({
        success: false,
        error: `Nomba does not support payouts to ${targetCurrency}${country ? ` (${country})` : ""}`,
        code: "corridor_unsupported",
        rail: "nomba",
      }, 400);
    }

    const accountName = ensureNombaReceiverName(String(transfer.recipient_name || "Recipient"));
    const narrative = String(transfer.description || `Transfer to ${accountName}`).slice(0, 120);
    const reference = `nomba-payout-${transfer_id}`;
    const senderId = transfer.sender_id as string;

    // Debit currency must be a pair Nomba can actually trade for our account's
    // trade region (NG). The customer's wallet currency (e.g. CAD) is NOT a valid
    // Nomba debit currency — CAD/KES returns 404 "Neither CAD/KES nor KES/CAD is found".
    const forcedSource = (Deno.env.get("NOMBA_PAYOUT_SOURCE_CURRENCY") || "").trim().toUpperCase();
    let payoutSourceCurrency = kind === "domestic_ngn" ? "NGN" : targetCurrency;
    let payoutAmount = Number(transfer.target_amount ?? 0);
    let lockedExchangeRateId: string | undefined;

    if (kind !== "domestic_ngn") {
      const candidates: string[] = [];
      const push = (c?: string | null) => {
        const v = String(c || "").trim().toUpperCase();
        if (v && !candidates.includes(v)) candidates.push(v);
      };
      push(forcedSource);
      // Prefer the float that matches the customer's funded wallet, then NG-region
      // NGN/USD (Nomba's Kenya docs use USD→KES). Never invent a dest-currency float
      // we don't hold (KES/KES fails for trade region NG).
      push(sourceCurrencyWallet);
      push("NGN");
      push("USD");

      const tried: string[] = [];
      const tryNotes: string[] = [];
      let resolved: { ccy: string; amount: number; rateId?: string } | null = null;

      for (const ccy of candidates) {
        if (ccy === targetCurrency) continue; // same-currency only handled below when wallet matches
        tried.push(`${ccy}/${targetCurrency}`);
        let rates;
        try {
          rates = await fetchNombaExchangeRates({
            sourceCurrency: ccy,
            destinationCurrency: targetCurrency,
          });
        } catch (e) {
          tryNotes.push(`${ccy}/${targetCurrency}: fetch error`);
          console.error("nomba exchange-rates failed", ccy, targetCurrency, e);
          continue;
        }
        if (!rates.exchangeRateId) {
          tryNotes.push(`${ccy}/${targetCurrency}: no exchangeRateId (${rates.json?.description || rates.json?.code || rates.status})`);
          console.log("nomba pair unavailable", ccy, targetCurrency, JSON.stringify(rates.json)?.slice(0, 300));
          continue;
        }

        // When debiting the customer's wallet currency, use their source_amount
        // (Authorize Transfer amount is in source currency per Nomba docs).
        if (ccy === sourceCurrencyWallet) {
          const debit = Number(transfer.source_amount ?? 0);
          if (debit > 0) {
            resolved = { ccy, amount: debit, rateId: rates.exchangeRateId };
            break;
          }
        }

        const rate = extractNombaRate(rates.json);
        if (!rate || rate <= 0) {
          tryNotes.push(`${ccy}/${targetCurrency}: have rateId but could not parse mid/ask/bid`);
          continue;
        }
        const target = Number(transfer.target_amount ?? 0);
        const debitAmount = Number((target / rate).toFixed(2));
        if (!debitAmount || debitAmount <= 0) {
          tryNotes.push(`${ccy}/${targetCurrency}: bad debit from target/rate`);
          continue;
        }
        resolved = { ccy, amount: debitAmount, rateId: rates.exchangeRateId };
        break;
      }

      // Same-currency only if the sender wallet IS that currency (real float).
      if (!resolved && sourceCurrencyWallet === targetCurrency) {
        resolved = { ccy: targetCurrency, amount: Number(transfer.target_amount ?? transfer.source_amount ?? 0) };
        tried.push(`${targetCurrency}/${targetCurrency}`);
      }

      if (!resolved) {
        return json({
          success: false,
          error: `Nomba has no tradable pair for ${targetCurrency} from trade region NG (tried ${tried.join(", ")}). ${tryNotes.slice(0, 3).join(" | ")}`,
          code: "pair_unavailable",
          rail: "nomba",
          pairs_tried: tried,
          pair_notes: tryNotes,
        }, 502);
      }

      payoutSourceCurrency = resolved.ccy;
      payoutAmount = resolved.amount;
      lockedExchangeRateId = resolved.rateId;
    }

    if (!payoutAmount || payoutAmount <= 0) {
      return json({ success: false, error: "Invalid payout amount", rail: "nomba" }, 400);
    }


    // ── Domestic NGN bank ─────────────────────────────────────────────
    if (kind === "domestic_ngn") {
      const accountNumber = String(transfer.recipient_account || body.account_number || "").replace(/\D/g, "");
      const bankCode = String(transfer.recipient_bank_code || body.bank_code || "").trim();
      if (!accountNumber || accountNumber.length !== 10 || !bankCode) {
        return json({
          success: false,
          error: "Nigerian bank payout requires bank_code and 10-digit account_number",
          code: "invalid_bank_details",
          rail: "nomba",
          error_class: "hard",
        }, 400);
      }

      await upsertPayoutTxn(supabase, {
        user_id: senderId,
        transfer_id,
        reference,
        amount: payoutAmount,
        currency: "NGN",
        account_number: accountNumber,
        bank_code: bankCode,
        account_name: accountName,
        status: "pending",
        raw_request: {
          kind,
          amount: payoutAmount,
          accountNumber,
          bankCode,
          merchantTxRef: reference,
        },
      });

      const result = await createNombaDomesticBankTransfer({
        amount: payoutAmount,
        accountNumber,
        accountName,
        bankCode,
        merchantTxRef: reference,
        senderName: "eFinMoney",
        narration: narrative,
      });

      if (!result.ok) {
        const reason = nombaFailureReason(result.json, "Nomba NGN bank payout failed");
        await supabase.from("nomba_payout_transactions").update({
          status: "failed",
          failure_reason: reason.slice(0, 500),
          raw_response: result.json,
        }).eq("reference", reference);
        return json({
          success: false,
          error: reason,
          code: "nomba_payout_failed",
          rail: "nomba",
          provider_message: reason,
          nomba_raw: result.json,
          raw_response: result.json,
        }, 502);
      }

      return await finalizeSuccess(supabase, {
        transfer_id,
        reference,
        senderId,
        accountName,
        amount: payoutAmount,
        currency: "NGN",
        providerRef: result.providerRef || reference,
        raw: result.json,
        status: result.transferStatus,
      });
    }

    // ── Global Interac ────────────────────────────────────────────────
    if (kind === "global_interac") {
      const acctHint = String(transfer.recipient_account || "").trim();
      const email = String(
        transfer.recipient_email
          || (transfer as Record<string, unknown>).recipient_interac_email
          || body.recipient_email
          || (acctHint.includes("@") ? acctHint : "")
          || "",
      ).trim();
      if (!email || !email.includes("@")) {
        return json({
          success: false,
          error: "Nomba Interac payout requires recipient email",
          code: "invalid_interac_details",
          rail: "nomba",
          error_class: "hard",
        }, 400);
      }

      const payload: Record<string, unknown> = {
        amount: payoutAmount,
        sourceCurrency: payoutSourceCurrency,
        destinationCurrency: "CAD",
        receiverName: accountName,
        sourceCountryIsoCode: String(transfer.sender_country || "NG").slice(0, 2).toUpperCase() || "NG",
        destinationCountryIsoCode: "CA",
        paymentMethod: "INTERAC",
        accountType: "INDIVIDUAL",
        narration: narrative,
        beneficiary: {
          beneficiaryEmail: email,
        },
      };
      if (lockedExchangeRateId) payload.lockedExchangeRateId = lockedExchangeRateId;

      await upsertPayoutTxn(supabase, {
        user_id: senderId,
        transfer_id,
        reference,
        amount: payoutAmount,
        currency: "CAD",
        account_number: email,
        bank_code: "INTERAC",
        account_name: accountName,
        status: "pending",
        raw_request: payload,
      });

      const result = await authorizeNombaGlobalTransfer(payload);
      if (!result.ok) {
        const reason = nombaFailureReason(result.json, "Nomba Interac payout failed");
        await supabase.from("nomba_payout_transactions").update({
          status: "failed",
          failure_reason: reason.slice(0, 500),
          raw_response: result.json,
        }).eq("reference", reference);
        return json({
          success: false,
          error: reason,
          code: "nomba_payout_failed",
          rail: "nomba",
          provider_message: reason,
          nomba_raw: result.json,
          raw_response: result.json,
        }, 502);
      }

      return await finalizeSuccess(supabase, {
        transfer_id,
        reference,
        senderId,
        accountName,
        amount: Number(transfer.target_amount ?? payoutAmount),
        currency: "CAD",
        providerRef: result.transactionId || reference,
        raw: result.json,
        status: result.transferStatus,
      });
    }

    // ── Global MoMo ───────────────────────────────────────────────────
    if (kind === "global_momo") {
      const destCountry = country || normalizeNombaCountry(null, targetCurrency);
      const network = resolveNetwork(payoutMethod, targetCurrency);
      const phoneRaw = String(transfer.recipient_phone || transfer.recipient_account || body.phone_number || "").trim();
      if (!phoneRaw) {
        return json({
          success: false,
          error: "Mobile money payout requires recipient phone",
          code: "invalid_momo_details",
          rail: "nomba",
          error_class: "hard",
        }, 400);
      }
      const accountNumber = normalizePhone(phoneRaw, destCountry);

      const listed = await listNombaInstitutions({ countryIsoCode: destCountry, isMobileMoney: true });
      const institution = pickNombaInstitution(
        listed.institutions,
        momoNetworkHints(network, destCountry),
        destCountry,
        network,
      );
      if (!institution) {
        return json({
          success: false,
          error: `No Nomba MoMo provider for ${destCountry}/${network}`,
          code: "provider_not_found",
          rail: "nomba",
        }, 502);
      }

      const payload: Record<string, unknown> = {
        amount: payoutAmount,
        sourceCurrency: payoutSourceCurrency,
        destinationCurrency: targetCurrency,
        receiverName: accountName,
        accountNumber,
        institutionName: institution.displayName,
        institutionCode: institution.code,
        sourceCountryIsoCode: String(transfer.sender_country || "NG").slice(0, 2).toUpperCase() || "NG",
        destinationCountryIsoCode: destCountry,
        paymentMethod: "MobileMoney",
        accountType: "INDIVIDUAL",
        narration: narrative,
      };
      if (lockedExchangeRateId) payload.lockedExchangeRateId = lockedExchangeRateId;

      await upsertPayoutTxn(supabase, {
        user_id: senderId,
        transfer_id,
        reference,
        amount: Number(transfer.target_amount ?? payoutAmount),
        currency: targetCurrency,
        account_number: accountNumber,
        bank_code: institution.code || "MOMO",
        account_name: accountName,
        status: "pending",
        raw_request: payload,
      });

      const result = await authorizeNombaGlobalTransfer(payload);
      if (!result.ok) {
        const reason = nombaFailureReason(
          result.json,
          result.transactionId
            ? `Nomba MoMo status ${result.transferStatus}`
            : "Nomba MoMo payout failed (no transaction id returned)",
        );
        await supabase.from("nomba_payout_transactions").update({
          status: "failed",
          failure_reason: reason.slice(0, 500),
          raw_response: result.json,
        }).eq("reference", reference);
        return json({
          success: false,
          error: reason,
          code: "nomba_payout_failed",
          rail: "nomba",
          provider_message: reason,
          nomba_raw: result.json,
          raw_response: result.json,
          payout_source_currency: payoutSourceCurrency,
          payout_amount: payoutAmount,
        }, 502);
      }

      return await finalizeSuccess(supabase, {
        transfer_id,
        reference,
        senderId,
        accountName,
        amount: Number(transfer.target_amount ?? payoutAmount),
        currency: targetCurrency,
        providerRef: result.transactionId || reference,
        raw: result.json,
        status: result.transferStatus,
      });
    }

    // ── Global bank / ACH / SEPA / Faster Payments ────────────────────
    const destCountry = country || normalizeNombaCountry(null, targetCurrency);
    let accountNumber = String(transfer.recipient_account || body.account_number || "").trim();
    let bankCode = String(transfer.recipient_bank_code || body.bank_code || "").trim();
    let bankName = String(transfer.recipient_bank_name || body.bank_name || "").trim();
    let transitNumber = String(
      (transfer as Record<string, unknown>).transit_number || body.transit_number || "",
    ).trim();

    // Canadian EFT: institution-transit-account stored in recipient_account.
    const payoutMethodLower = String(transfer.payout_method || "").toLowerCase();
    if (
      targetCurrency === "CAD"
      && (payoutMethodLower.includes("eft") || accountNumber.includes("-"))
    ) {
      const rawParts = accountNumber.split("-");
      if (rawParts.length >= 3) {
        const inst = (rawParts[0] || "").replace(/\D/g, "").padStart(3, "0");
        const transit = (rawParts[1] || "").replace(/\D/g, "").padStart(5, "0");
        const acct = String(rawParts.slice(2).join("-")).replace(/\D/g, "");
        if (inst && transit && acct) {
          bankCode = bankCode || inst;
          transitNumber = transitNumber || transit;
          accountNumber = acct;
        }
      }
    }

    if (!accountNumber) {
      return json({
        success: false,
        error: "Bank payout requires account number",
        code: "invalid_bank_details",
        rail: "nomba",
        error_class: "hard",
      }, 400);
    }

    const paymentMethod = nombaBankPaymentMethod(targetCurrency, destCountry, payoutMethod);
    let institutionCode = bankCode;
    let institutionName = bankName;

    if (!institutionName || !institutionCode) {
      const listed = await listNombaInstitutions({ countryIsoCode: destCountry, isMobileMoney: false });
      const match = listed.institutions.find((i) =>
        i.code === bankCode
        || i.code.toLowerCase() === bankCode.toLowerCase()
        || (bankName && i.displayName.toLowerCase().includes(bankName.toLowerCase()))
      ) || listed.institutions[0];
      if (match) {
        institutionCode = institutionCode || match.code;
        institutionName = institutionName || match.displayName;
      }
    }

    const payload: Record<string, unknown> = {
      amount: payoutAmount,
      sourceCurrency: payoutSourceCurrency,
      destinationCurrency: targetCurrency,
      receiverName: accountName,
      accountNumber,
      sourceCountryIsoCode: String(transfer.sender_country || "NG").slice(0, 2).toUpperCase() || "NG",
      destinationCountryIsoCode: destCountry,
      paymentMethod,
      accountType: "INDIVIDUAL",
      narration: narrative,
    };
    if (institutionCode) payload.institutionCode = institutionCode;
    if (institutionName) payload.institutionName = institutionName;
    if (lockedExchangeRateId) payload.lockedExchangeRateId = lockedExchangeRateId;

    // Optional compliance fields when present on the transfer row.
    const t = transfer as Record<string, unknown>;
    if (t.purpose_of_payment) payload.purposeOfPayment = t.purpose_of_payment;
    if (t.bank_account_type) payload.bankAccountType = t.bank_account_type;
    if (t.recipient_email || t.beneficiary_email) {
      payload.beneficiary = {
        ...(payload.beneficiary as Record<string, unknown> | undefined),
        beneficiaryEmail: String(t.recipient_email || t.beneficiary_email),
      };
    }
    if (t.transit_number || transitNumber) {
      payload.beneficiary = {
        ...(payload.beneficiary as Record<string, unknown> | undefined),
        transitNumber: String(t.transit_number || transitNumber),
      };
    }

    await upsertPayoutTxn(supabase, {
      user_id: senderId,
      transfer_id,
      reference,
      amount: Number(transfer.target_amount ?? payoutAmount),
      currency: targetCurrency,
      account_number: accountNumber,
      bank_code: institutionCode || paymentMethod,
      account_name: accountName,
      status: "pending",
      raw_request: payload,
    });

    const result = await authorizeNombaGlobalTransfer(payload);
    if (!result.ok) {
      const reason = nombaFailureReason(result.json, "Nomba bank payout failed");
      await supabase.from("nomba_payout_transactions").update({
        status: "failed",
        failure_reason: reason.slice(0, 500),
        raw_response: result.json,
      }).eq("reference", reference);
      return json({
        success: false,
        error: reason,
        code: "nomba_payout_failed",
        rail: "nomba",
        provider_message: reason,
        nomba_raw: result.json,
        raw_response: result.json,
      }, 502);
    }

    return await finalizeSuccess(supabase, {
      transfer_id,
      reference,
      senderId,
      accountName,
      amount: Number(transfer.target_amount ?? payoutAmount),
      currency: targetCurrency,
      providerRef: result.transactionId || reference,
      raw: result.json,
      status: result.transferStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("nomba-payout error:", msg);
    return json({ success: false, error: msg, rail: "nomba" }, 500);
  }
});

async function upsertPayoutTxn(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
) {
  const { error: insErr } = await supabase.from("nomba_payout_transactions").insert(row);
  if (insErr && !String(insErr.message || "").includes("duplicate")) {
    throw new Error(insErr.message);
  }
}

async function finalizeSuccess(
  supabase: ReturnType<typeof createClient>,
  opts: {
    transfer_id: string;
    reference: string;
    senderId: string;
    accountName: string;
    amount: number;
    currency: string;
    providerRef: string;
    raw: unknown;
    status: string;
  },
) {
  const done = isTerminalSuccess(opts.status) || nombaRawIndicatesDelivered(opts.raw);
  const pending = !done && isPendingStatus(opts.status);
  const completedAt = new Date().toISOString();

  await supabase.from("nomba_payout_transactions").update({
    status: done ? "completed" : "processing",
    provider_reference: opts.providerRef,
    raw_response: opts.raw,
  }).eq("reference", opts.reference);

  await supabase.from("transfers").update({
    status: done ? "completed" : "processing",
    completed_at: done ? completedAt : null,
    provider_reference: opts.providerRef,
    provider_charge_id: "rail:nomba",
    failure_reason: null,
  }).eq("id", opts.transfer_id);

  if (done) {
    await supabase.from("notifications").insert({
      user_id: opts.senderId,
      title: "Transfer complete",
      message: `Your ${opts.currency} ${opts.amount} transfer to ${opts.accountName} has been delivered.`,
      type: "info",
    });
  }

  return json({
    success: true,
    queued: pending || !done,
    reference: opts.providerRef,
    amount: opts.amount,
    currency: opts.currency,
    source: "nomba",
    rail: "nomba",
    status: done ? "completed" : "processing",
  });
}
