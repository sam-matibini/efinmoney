import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";
import { ngBankCodeCandidates } from "../_shared/ng-bank-codes.ts";
import { resolveCadInteracDestination } from "../_shared/cadInteracPayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

/** Map Flutterwave / stored GH bank codes to Fincra bankSwiftCode values via /core/banks. */
async function resolveGhBankSwiftCodes(
  storedCode: string,
  storedName: string,
): Promise<string[]> {
  const out: string[] = [];
  const push = (c: string) => {
    const s = String(c || "").trim();
    if (s && !out.includes(s)) out.push(s);
  };

  const name = storedName.trim().toLowerCase();
  const paths = [
    "/core/banks?currency=GHS&country=GH",
    "/core/banks?currency=GHS",
    "/core/banks?country=GH",
  ];

  // Prefer Fincra's own codes matched by bank name — FLW numeric codes are usually invalid as bankSwiftCode.
  for (const path of paths) {
    try {
      const r = await fincraFetch(path, { method: "GET" });
      if (!r.ok) continue;
      const data = r.json?.data;
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as Record<string, unknown> | undefined)?.data)
        ? (data as Record<string, unknown>).data as unknown[]
        : Array.isArray(r.json?.banks)
        ? r.json.banks as unknown[]
        : [];

      const rows = list
        .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === "object")
        .map((row) => ({
          code: String(
            row.swiftCode
              ?? row.swift_code
              ?? row.bankSwiftCode
              ?? row.code
              ?? row.bankCode
              ?? row.bank_code
              ?? "",
          ).trim(),
          name: String(row.name ?? row.bankName ?? row.bank_name ?? "").trim().toLowerCase(),
        }))
        .filter((b) => b.code);

      // 1) Exact name match first
      if (name) {
        for (const b of rows) {
          if (b.name === name) push(b.code);
        }
        for (const b of rows) {
          if (b.name.includes(name) || name.includes(b.name)) push(b.code);
        }
      }
      // 2) Exact code match (only if it already looks like a SWIFT / Fincra code)
      for (const b of rows) {
        if (
          b.code === storedCode
          || b.code.toUpperCase() === storedCode.toUpperCase()
        ) {
          push(b.code);
        }
      }

      if (out.length) break;
    } catch {
      /* try next path */
    }
  }

  // Last resort: stored value only if it looks like a SWIFT (letters), not a short FLW digit code.
  if (!out.length && /[A-Za-z]/.test(storedCode) && storedCode.length >= 4) {
    push(storedCode);
  }
  return out;
}

interface PayoutRequest {
  transfer_id: string;
  phone_number?: string;
  account_number?: string;
  bank_code?: string;
  amount: number;
  currency: string;
  network: string;
  recipient_name: string;
  /** Preferred Fincra wallet to debit (e.g. NGN). Falls back to FINCRA_PAYOUT_SOURCE_CURRENCY. */
  source_currency?: string;
  fincra_source_currency?: string;
  // When true (set by execute-transfer for fallback logic), on Fincra API failure
  // skip the ledger reversal and status update — execute-transfer will handle them.
  skip_reversal?: boolean;
  /** Retry a failed payout that was never refunded (always uses a new customerReference). */
  force_retry?: boolean;
}

function isFincraBalanceError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("insufficient funds in customer wallet") ||
         m.includes("insufficient balance") ||
         (m.includes("insufficient") && m.includes("wallet")) ||
         m.includes("provider balance low") ||
         m.includes("dont have enough money") ||
         m.includes("don't have enough money") ||
         m.includes("do not have enough money");
}

const FINCRA_MM_CODE: Record<string, string> = {
  // Payout API for KE expects SAFARICOM (MPESA returns "not supported for country KE").
  "KES:mpesa": "SAFARICOM",
  "KES:safaricom": "SAFARICOM",
  "KES:m-pesa": "SAFARICOM",
  "KES:airtel": "AIRTEL",
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
  "XOF:orange": "ORANGE",
  "XOF:mtn": "MTN",
  "XOF:moov": "MOOV",
  "XOF:wave": "WAVE",
  "XAF:mtn": "MTN",
  "XAF:orange": "ORANGE",
};

/** Currencies we will try as Fincra funding wallets (after preferred). */
const DEFAULT_FUNDING_FALLBACKS = ["NGN", "CAD", "USD", "GHS", "KES", "ZMW"];

const DIAL_BY_CURRENCY: Record<string, string> = {
  NGN: "234",
  KES: "254",
  GHS: "233",
  UGX: "256",
  TZS: "255",
  ZMW: "260",
  RWF: "250",
  XOF: "221",
  XAF: "237",
  ZAR: "27",
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Recipient", lastName: "User" };
  // Single given name — do NOT duplicate ("Mary Mary" fails KE name checks).
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizePhone(phone: string, currency: string): string {
  let p = phone.replace(/[^\d+]/g, "");
  const dial = DIAL_BY_CURRENCY[currency] || "";

  if (p.startsWith("+")) {
    const digits = p.slice(1).replace(/\D/g, "");
    // Collapse accidental double country code: +26026077… → +26077…
    if (dial && digits.startsWith(dial + dial)) {
      return `+${dial}${digits.slice(dial.length * 2)}`;
    }
    return `+${digits}`;
  }

  let digits = p.replace(/\D/g, "");
  // National format 07… → strip trunk 0
  if (digits.startsWith("0") && !(dial && digits.startsWith(dial))) {
    digits = digits.slice(1);
  }
  // Already includes country code (26077… / 2547…) — do NOT prepend again
  if (dial && digits.startsWith(dial)) {
    if (digits.startsWith(dial + dial)) {
      digits = dial + digits.slice(dial.length * 2);
    }
    return `+${digits}`;
  }
  if (dial) return `+${dial}${digits}`;
  return `+${digits}`;
}

/** Fincra MoMo docs: MSISDN without '+' (e.g. 254700000000). */
function fincraMsisdnDigits(phone: string, currency: string): string {
  return normalizePhone(phone, currency).replace(/^\+/, "");
}

/**
 * Fincra MoMo accountNumber: countryCallingCode + national number, no '+'.
 * Zambia: Fincra confirmed 260… is correct.
 */
function fincraAccountNumber(phone: string, currency: string): string {
  return fincraMsisdnDigits(phone, currency);
}

/** Zambia MSISDN must be 260 + 9 national digits (26097…, 26077…, 26095…). */
export function zmwMsisdn(phone: string): { ok: true; msisdn: string } | { ok: false; error: string } {
  let digits = String(phone).replace(/\D/g, "");
  // Collapse any number of leading 260 repeats and trunk zeros: 0260…, 260260…
  for (let i = 0; i < 4; i++) {
    if (digits.startsWith("0")) { digits = digits.slice(1); continue; }
    if (digits.startsWith("260260")) { digits = digits.slice(3); continue; }
    break;
  }
  if (digits.startsWith("260")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 9) {
    return {
      ok: false,
      error: "Zambian mobile money number must be 9 digits after the 260 country code (e.g. 260 97 1234567).",
    };
  }
  return { ok: true, msisdn: `260${digits}` };
}

/** MoMo MSISDN shapes to try. Zambia sends exactly one canonical 260… form. */
function fincraAccountNumberVariants(phone: string, currency: string): string[] {
  const intl = fincraMsisdnDigits(phone, currency); // e.g. 260770069550
  const dial = DIAL_BY_CURRENCY[currency] || "";
  let national = intl;
  if (dial && national.startsWith(dial)) national = national.slice(dial.length);
  if (national.startsWith("0")) national = national.slice(1);
  const local0 = national ? `0${national}` : "";

  // Reject garbage like 260260… if anything slipped through
  const cleanIntl = (dial && intl.startsWith(dial + dial))
    ? dial + intl.slice(dial.length * 2)
    : intl;

  if (currency === "ZMW") {
    // Fincra only accepts 260 + 9 digits. Never waste attempts on 0260…/260260…/local.
    const z = zmwMsisdn(phone);
    return z.ok ? [z.msisdn] : [];
  }

  return [...new Set([cleanIntl, local0, national].filter(Boolean))];
}


function isFincraAccountNumberError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("account number") ||
    m.includes("accountnumber") ||
    (m.includes("valid") && m.includes("mobile money"));
}

/** HTTP 200 can still mean the payout was created as failed. */
function fincraPayoutAccepted(json: Record<string, unknown> | null | undefined): {
  accepted: boolean;
  status: string;
  message: string;
  data: Record<string, unknown>;
} {
  const data = (json?.data ?? {}) as Record<string, unknown>;
  const status = String(data.status || json?.status || "").toLowerCase();
  const message = String(
    data.message || data.reason || data.failureReason || json?.error || json?.message || "",
  );
  const failed = ["failed", "cancelled", "canceled", "rejected"].includes(status)
    || /transaction failed|contact support|re-try after/i.test(message);
  const softOk = !status || ["processing", "pending", "successful", "success", "completed"].includes(status);
  return {
    accepted: !failed && softOk,
    status,
    message: message || (failed ? `Fincra payout ${status || "failed"}` : ""),
    data,
  };
}

/** True when Fincra's generic outage copy — worth retrying another network/format. */
function isFincraTransientPayoutError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("contact support")
    || m.includes("re-try after")
    || m.includes("retry after")
    || m.includes("technical issue")
    || m.includes("try again");
}

/** Whole corridor is down at the provider — no network/format retry can help. */
function isFincraCorridorDownError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("maintenance")
    || m.includes("temporarily unavailable")
    || m.includes("currently unavailable")
    || m.includes("service unavailable")
    // CAD Interac: merchant fee schedule missing / not priced — fail over to Nomba.
    || m.includes("unable to calculate custom disbursement fee")
    || m.includes("failed to calculate disbursement fee")
    || m.includes("calculate disbursement fee")
    || m.includes("disbursement fee");
}

export type FincraErrorClass = "corridor_down" | "transient" | "hard";

/** Classify a Fincra failure so callers know whether to fail over to another rail. */
export function classifyFincraError(message: string): FincraErrorClass {
  if (isFincraCorridorDownError(message)) return "corridor_down";
  if (isFincraTransientPayoutError(message)) return "transient";
  return "hard";
}


const CURRENCY_TO_COUNTRY: Record<string, string> = {
  NGN: "NG",
  KES: "KE",
  GHS: "GH",
  UGX: "UG",
  TZS: "TZ",
  ZMW: "ZM",
  RWF: "RW",
  XOF: "SN",
  XAF: "CM",
  ZAR: "ZA",
};

function preferredFundingCurrency(body: PayoutRequest, dest: string): string {
  const fromBody = (body.fincra_source_currency || body.source_currency || "").trim().toUpperCase();
  if (fromBody) return fromBody;
  const fromEnv = (Deno.env.get("FINCRA_PAYOUT_SOURCE_CURRENCY") || "NGN").trim().toUpperCase();
  return fromEnv || dest;
}

function fundingCandidates(preferred: string, dest: string): string[] {
  const extras = (Deno.env.get("FINCRA_PAYOUT_SOURCE_FALLBACKS") || "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  // Zambia: NGN → CAD → USD → ZMW. Never let env fallbacks pull in a wallet
  // (RWF/UGX/…) that Fincra cannot quote from — that produced the
  // "No currency supported to make payout to, from RWF" failures.
  if (dest === "ZMW") {
    const allowed = ["NGN", "CAD", "USD", "ZMW"];
    const list = allowed.includes(preferred)
      ? [preferred, ...allowed.filter((c) => c !== preferred)]
      : allowed;
    return list;
  }
  // NGN bank: prefer NGN float, then CAD (treasury often sits there), then USD.
  // Avoid GHS/KES/etc — those quotes 404 and mask the real bank failure.
  if (dest === "NGN") {
    const allowed = ["NGN", "CAD", "USD"];
    const list = [
      preferred,
      "NGN",
      "CAD",
      ...extras.filter((c) => allowed.includes(c)),
      "USD",
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of list) {
      if (!c || seen.has(c)) continue;
      if (!allowed.includes(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out.length ? out : ["NGN", "CAD"];
  }
  // MoMo corridors: prefer NGN float, then CAD (treasury often sits there), then USD.
  const defaults = ["KES", "GHS"].includes(dest)
    ? ["NGN", "CAD", "USD", dest]
    : DEFAULT_FUNDING_FALLBACKS;
  const list = [preferred, dest, ...extras, ...defaults];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of list) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

function isUnsupportedFundingError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("no currency supported")
    || m.includes("currency not supported")
    || m.includes("unsupported currency")
    || m.includes("quote http 404")
    || (m.includes("quote") && m.includes("404"))
    || m.includes("quote") && m.includes("not found");
}

type QuoteResult = {
  reference: string;
  /** Debit from wallet incl. fees — for balance checks / logging only. */
  amountToCharge: number;
  /** Payout `amount` must equal this when quoteReference is set. */
  sourceAmount: number;
  amountToReceive: number;
  rate?: number;
  fee?: number;
  raw: Record<string, unknown>;
};

async function generateDisbursementQuote(opts: {
  businessId: string;
  sourceCurrency: string;
  destinationCurrency: string;
  /** Amount the beneficiary should receive in destination currency. */
  receiveAmount: number;
  paymentDestination: "mobile_money_wallet" | "bank_account";
  paymentScheme?: string;
}): Promise<{ ok: true; quote: QuoteResult } | { ok: false; error: string }> {
  const amountStr = String(opts.receiveAmount);
  const body: Record<string, unknown> = {
    sourceCurrency: opts.sourceCurrency,
    destinationCurrency: opts.destinationCurrency,
    amount: amountStr,
    // receive → amount is what beneficiary gets; quote returns NGN (etc.) to charge.
    action: "receive",
    transactionType: "disbursement",
    business: opts.businessId,
    // Fee from our Fincra float so recipient gets the full destination amount.
    feeBearer: "business",
    paymentDestination: opts.paymentDestination,
    beneficiaryType: "individual",
  };
  if (opts.paymentScheme) body.paymentScheme = opts.paymentScheme;
  const { ok, status, json } = await fincraFetch("/quotes/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!ok) {
    return {
      ok: false,
      error: String(json?.error || json?.message || `Quote HTTP ${status}`),
    };
  }

  const data = (json?.data ?? {}) as Record<string, unknown>;
  const reference = String(data.reference || "");
  const sourceAmount = Number(data.sourceAmount ?? data.quotedAmount ?? 0);
  const amountToCharge = Number(data.amountToCharge ?? sourceAmount);
  const amountToReceive = Number(data.amountToReceive ?? data.destinationAmount ?? opts.receiveAmount);
  // Fincra rejects payouts when amount ≠ quoted sourceAmount (not amountToCharge).
  const payoutAmount = sourceAmount > 0 ? sourceAmount : amountToCharge;
  if (!reference || !(payoutAmount > 0)) {
    return { ok: false, error: "Fincra quote missing reference or source amount" };
  }

  return {
    ok: true,
    quote: {
      reference,
      amountToCharge: amountToCharge > 0 ? amountToCharge : payoutAmount,
      sourceAmount: payoutAmount,
      amountToReceive,
      rate: data.rate != null ? Number(data.rate) : undefined,
      fee: data.fee != null ? Number(data.fee) : undefined,
      raw: data,
    },
  };
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

function parseCadEftAccount(raw: string): { institution: string; transit: string; account: string } | null {
  const parts = String(raw || "").split("-").map((p) => p.replace(/\D/g, ""));
  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
    return {
      institution: parts[0].padStart(3, "0"),
      transit: parts[1].padStart(5, "0"),
      account: parts.slice(2).join(""),
    };
  }
  return null;
}

/** CAD Interac e-Transfer or EFT via Fincra disbursements. Failover-safe (no refund when skip_reversal).
 * Docs: https://docs.fincra.com/docs/send-cad-payouts-via-interac-e-transfer
 * Interac uses beneficiary.interacEmail + paymentScheme "interac"; amount is a JSON number.
 */
async function payoutCanadaCadViaFincra(opts: {
  supabase: ReturnType<typeof createClient>;
  transfer: Record<string, unknown>;
  transfer_id: string;
  senderId: string;
  amount: number;
  network: string;
  recipient_name: string;
  skip_reversal: boolean;
}): Promise<Response> {
  const cfg = getFincraConfig();
  if (!cfg.secretKey || !cfg.businessId) {
    return new Response(JSON.stringify({
      success: false,
      error: "Fincra is not configured",
      retryable: true,
      error_class: "unavailable",
      rail: "fincra",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const method = String(opts.transfer.payout_method || opts.network || "").toLowerCase();
  const isEft = method === "eft" || method === "bank" || method.includes("eft");
  const { firstName, lastName } = splitName(opts.recipient_name);
  const destAmount = Math.round(Number(opts.amount) * 100) / 100;
  const attemptErrors: string[] = [];

  const jsonFail = (error: string, errorClass: string, hard = false, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({
      success: false,
      error,
      error_class: errorClass,
      retryable: !hard,
      refunded: false,
      rail: "fincra",
      attempts: attemptErrors,
      ...extra,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let beneficiary: Record<string, unknown>;
  let paymentScheme: string;

  if (isEft) {
    const parsed = parseCadEftAccount(String(opts.transfer.recipient_account || ""));
    const account = parsed?.account || String(opts.transfer.recipient_account || "").replace(/\D/g, "");
    const institution = parsed?.institution || String(opts.transfer.recipient_bank_code || "").replace(/\D/g, "");
    const transit = parsed?.transit || String((opts.transfer as Record<string, unknown>).transit_number || "").replace(/\D/g, "");
    if (!account || !institution) {
      return jsonFail("CAD EFT payout requires institution and account number", "hard", true);
    }
    paymentScheme = "eft";
    beneficiary = {
      firstName,
      lastName,
      type: "individual",
      accountHolderName: opts.recipient_name,
      accountNumber: account,
      bankCode: institution,
      country: "CA",
      ...(transit ? { transitNumber: transit } : {}),
    };
  } else {
    const dest = resolveCadInteracDestination({
      recipient_account: opts.transfer.recipient_account as string | null,
      recipient_phone: opts.transfer.recipient_phone as string | null,
      interac_email: (opts.transfer.recipient_interac_email || opts.transfer.interac_email) as string | null,
      recipient_email: opts.transfer.recipient_email as string | null,
    });
    if (!dest.ok) {
      return jsonFail(dest.error, "hard", true, { code: "missing_interac_contact" });
    }
    // Fincra CAD Interac payout requires an Autodeposit email (not mobile-only).
    if (!dest.dest.email) {
      return jsonFail(
        "Fincra CAD Interac payout requires the recipient’s Autodeposit email — phone-only goes to Nomba failover",
        "unavailable",
        false,
        { code: "fincra_interac_email_required" },
      );
    }

    // Verify Autodeposit before disbursing (docs: POST /core/accounts/resolve or /accounts/resolve).
    let resolvedName = opts.recipient_name;
    const resolveBodies = [
      { currency: "CAD", type: "interac_etransfer", interacEmail: dest.dest.email },
      { currency: "CAD", type: "interac", interacEmail: dest.dest.email },
    ];
    let resolveOk = false;
    for (const path of ["/core/accounts/resolve", "/accounts/resolve"]) {
      for (const body of resolveBodies) {
        try {
          const resolved = await fincraFetch(path, { method: "POST", body: JSON.stringify(body) });
          const data = (resolved.json?.data ?? {}) as Record<string, unknown>;
          if (resolved.ok && data.autoDepositEnabled === false) {
            return jsonFail(
              `Recipient ${dest.dest.email} does not have Interac Autodeposit enabled — ask them to enable it, or use Nomba`,
              "hard",
              true,
              { code: "interac_autodeposit_disabled" },
            );
          }
          if (resolved.ok && (data.autoDepositEnabled === true || data.accountName || data.email)) {
            resolveOk = true;
            if (data.accountName) resolvedName = String(data.accountName);
            break;
          }
          if (!resolved.ok) {
            attemptErrors.push(`resolve ${path}: ${String(resolved.json?.message || resolved.json?.error || resolved.status)}`);
          }
        } catch (e) {
          attemptErrors.push(`resolve ${path}: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      if (resolveOk) break;
    }
    // Soft-continue if resolve endpoint is unavailable on this merchant — payout may still succeed.
    if (!resolveOk) {
      console.warn("fincra CAD Interac resolve skipped/failed", attemptErrors.slice(-3));
    }

    const nameParts = splitName(resolvedName);
    paymentScheme = "interac";
    beneficiary = {
      firstName: nameParts.firstName,
      lastName: nameParts.lastName,
      type: "individual",
      accountHolderName: resolvedName,
      interacEmail: dest.dest.email,
      country: "CA",
    };
  }

  const schemes = isEft ? ["eft", "EFT"] : ["interac"];
  // CAD Interac: prefer same-currency CAD wallet (docs). Only fall back to NGN if CAD float
  // is short. Never USD — Fincra returns "failed to calculate disbursement fee" on USD→CAD Interac.
  const funding = ["CAD", "NGN"];

  let successJson: Record<string, unknown> | null = null;
  let usedSource = "CAD";
  let usedCustomerReference = opts.transfer_id;
  let usedQuote: QuoteResult | null = null;
  let cadWalletShort = false;

  for (const sourceCurrency of funding) {
    if (successJson) break;
    // After a real CAD debit failure that isn't "insufficient", stop — don't thrash quotes.
    if (sourceCurrency !== "CAD" && !cadWalletShort && attemptErrors.some((a) => a.startsWith("CAD scheme="))) {
      break;
    }
    const cross = sourceCurrency !== "CAD";
    let quoted: QuoteResult | null = null;
    if (cross) {
      const q = await generateDisbursementQuote({
        businessId: cfg.businessId,
        sourceCurrency,
        destinationCurrency: "CAD",
        receiveAmount: destAmount,
        paymentDestination: "bank_account",
        paymentScheme,
      });
      if (!q.ok) {
        attemptErrors.push(`${sourceCurrency}->CAD quote: ${q.error}`);
        continue;
      }
      quoted = q.quote;
    }

    for (const scheme of schemes) {
      if (successJson) break;
      const customerReference = `${opts.transfer_id}__cad_${sourceCurrency}_${scheme}_${Date.now().toString(36)}`;
      const payload: Record<string, unknown> = {
        business: cfg.businessId,
        sourceCurrency,
        destinationCurrency: "CAD",
        description: `eFinMoney CAD ${isEft ? "EFT" : "Interac"} to ${opts.recipient_name}`,
        paymentDestination: "bank_account",
        paymentScheme: scheme,
        customerReference,
        beneficiary,
        // Fee from merchant float so recipient gets the full amount (Fincra custom fee schedules).
        feeBearer: "business",
        // Fincra docs require amount as a JSON number (not a string).
        amount: cross && quoted
          ? Math.round(quoted.sourceAmount * 100) / 100
          : destAmount,
      };
      if (cross && quoted) payload.quoteReference = quoted.reference;

      const { ok, status, json } = await fincraFetch("/disbursements/payouts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const outcome = fincraPayoutAccepted(json as Record<string, unknown>);
      if (ok && outcome.accepted) {
        successJson = json as Record<string, unknown>;
        usedSource = sourceCurrency;
        usedCustomerReference = customerReference;
        usedQuote = quoted;
        break;
      }
      const reason = outcome.message
        || String((json as { error?: string; message?: string })?.error
          || (json as { message?: string })?.message
          || `HTTP ${status}`);
      attemptErrors.push(`${sourceCurrency} scheme=${scheme}: ${reason}`);
      const lower = reason.toLowerCase();
      if (lower.includes("destination currency") && lower.includes("not supported")) {
        return jsonFail(
          "Fincra CAD Interac/EFT payout is not enabled on this merchant — trying the next rail",
          "unavailable",
        );
      }
      if (sourceCurrency === "CAD" && isFincraBalanceError(reason)) {
        cadWalletShort = true;
        break;
      }
      if (isFincraBalanceError(reason) || isUnsupportedFundingError(reason)) break;
    }
  }

  if (!successJson) {
    const reason = (attemptErrors.length
      ? attemptErrors.join(" | ")
      : "Fincra CAD payout failed").slice(0, 500);
    if (opts.skip_reversal) {
      return jsonFail(reason, classifyFincraError(reason) === "hard" ? "hard" : "unavailable");
    }
    const rev = await reverseTransferLedger(opts.supabase, opts.transfer_id);
    await opts.supabase.from("transfers").update({
      status: "failed",
      failure_reason: reason.slice(0, 500),
    }).eq("id", opts.transfer_id);
    return new Response(JSON.stringify({
      success: false,
      error: reason,
      error_class: "unavailable",
      retryable: true,
      refunded: rev.reversed,
      rail: "fincra",
      attempts: attemptErrors,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const pdata = (successJson.data ?? {}) as Record<string, unknown>;
  const providerRef = String(pdata.reference || pdata.id || usedCustomerReference);
  await opts.supabase.from("transfers").update({
    status: "processing",
    provider_reference: providerRef,
    provider_charge_id: usedQuote
      ? `rail:fincra|src:${usedSource}|dst:CAD|cref:${usedCustomerReference}|q:${usedQuote.reference}`
      : `rail:fincra|src:${usedSource}|dst:CAD|cref:${usedCustomerReference}`,
  }).eq("id", opts.transfer_id);
  await opts.supabase.from("notifications").insert({
    user_id: opts.senderId,
    title: "Transfer initiated",
    message: `Your CAD ${destAmount} transfer to ${opts.recipient_name} is being processed via Fincra.`,
    type: "info",
  });
  return new Response(JSON.stringify({
    success: true,
    reference: providerRef,
    rail: "fincra",
    source_currency: usedSource,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Default purpose-of-payment file for Fincra USD FCY payouts (docs require `files`). */
const DEFAULT_USD_PURPOSE_FILE =
  Deno.env.get("FINCRA_USD_PURPOSE_FILE_URL")?.trim()
  || "https://www.efin.money/terms";

/**
 * USD ACH or SWIFT via Fincra disbursements.
 * UI `ach` → paymentScheme ach; UI `wire` → paymentScheme swift.
 * Funding: USD then NGN. Soft-fail for Nomba failover when skip_reversal.
 */
async function payoutUsdViaFincra(opts: {
  supabase: ReturnType<typeof createClient>;
  transfer: Record<string, unknown>;
  transfer_id: string;
  senderId: string;
  amount: number;
  network: string;
  recipient_name: string;
  skip_reversal: boolean;
}): Promise<Response> {
  const cfg = getFincraConfig();
  if (!cfg.secretKey || !cfg.businessId) {
    return new Response(JSON.stringify({
      success: false,
      error: "Fincra is not configured",
      retryable: true,
      error_class: "unavailable",
      rail: "fincra",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const method = String(opts.transfer.payout_method || opts.network || "").toLowerCase();
  const isSwift = method === "wire" || method === "swift" || method.includes("swift");
  const paymentScheme = isSwift ? "swift" : "ach";
  const { firstName, lastName } = splitName(opts.recipient_name);
  const destAmount = Math.round(Number(opts.amount) * 100) / 100;
  const attemptErrors: string[] = [];

  const jsonFail = (error: string, errorClass: string, hard = false, extra: Record<string, unknown> = {}) =>
    new Response(JSON.stringify({
      success: false,
      error,
      error_class: errorClass,
      retryable: !hard,
      refunded: false,
      rail: "fincra",
      attempts: attemptErrors,
      ...extra,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const account = String(opts.transfer.recipient_account || "").replace(/\s+/g, "");
  const routing = String(opts.transfer.recipient_bank_code || "").replace(/\D/g, "");
  const bankName = String(
    (opts.transfer as Record<string, unknown>).recipient_bank_name
    || (opts.transfer as Record<string, unknown>).bank_name
    || "US Bank",
  ).trim();
  const email = String(
    opts.transfer.recipient_email
    || (opts.transfer as Record<string, unknown>).beneficiary_email
    || "",
  ).trim();

  if (!account || routing.length !== 9) {
    return jsonFail("USD ACH/SWIFT payout requires a 9-digit ABA routing number and account number", "hard", true);
  }

  const meta = (opts.transfer.metadata || {}) as Record<string, unknown>;
  const bankDetails = (opts.transfer.recipient_bank_details || meta.bank_details || {}) as Record<string, unknown>;
  const street = String(bankDetails.street || bankDetails.address_street || meta.street || "178 Brookfield Crescent").trim();
  const state = String(bankDetails.state || bankDetails.address_state || meta.state || "MB").trim();
  const city = String(bankDetails.city || bankDetails.address_city || meta.city || "Winnipeg").trim();
  const zip = String(bankDetails.zip || bankDetails.postal_code || meta.zip || "R3Y0L7").trim();
  const swiftBic = String(
    bankDetails.swift_bic || bankDetails.bankSwiftCode || bankDetails.swift || meta.swift_bic || routing,
  ).trim();

  if (isSwift && (!street || !city || !state || !zip)) {
    return jsonFail(
      "USD SWIFT/wire requires beneficiary address (street, city, state, zip)",
      "hard",
      true,
      { code: "usd_swift_address_required" },
    );
  }

  const beneficiary: Record<string, unknown> = {
    firstName,
    lastName,
    type: "individual",
    accountHolderName: opts.recipient_name,
    accountNumber: account,
    country: "US",
    bankName,
    bankCode: routing,
    ...(email ? { email } : {}),
    address: {
      street,
      state,
      city,
      zip,
      country: "US",
    },
  };
  if (isSwift) {
    beneficiary.bankSwiftCode = swiftBic;
    beneficiary.bankAddress = {
      street: String(bankDetails.bank_street || street),
      state: String(bankDetails.bank_state || state),
      city: String(bankDetails.bank_city || city),
      zip: String(bankDetails.bank_zip || zip),
      country: "US",
    };
  }

  const sender = {
    senderType: "business",
    name: Deno.env.get("FINCRA_USD_SENDER_NAME")?.trim() || "eFinTax Advisors Ltd",
    email: Deno.env.get("FINCRA_USD_SENDER_EMAIL")?.trim() || "sam@efin.money",
    idType: "business_registration_number",
    idNumber: Deno.env.get("FINCRA_USD_SENDER_ID")?.trim() || "EFINTAX",
    countryOfOrigin: "CA",
    address: {
      street: "178 Brookfield Crescent",
      state: "Manitoba",
      city: "Winnipeg",
      zip: "R3Y 0L7",
      country: "CA",
    },
  };

  const funding = ["USD", "NGN"];
  let successJson: Record<string, unknown> | null = null;
  let usedSource = "USD";
  let usedCustomerReference = opts.transfer_id;
  let usedQuote: QuoteResult | null = null;
  let usdWalletShort = false;

  for (const sourceCurrency of funding) {
    if (successJson) break;
    if (sourceCurrency !== "USD" && !usdWalletShort && attemptErrors.some((a) => a.startsWith("USD scheme="))) {
      break;
    }
    const cross = sourceCurrency !== "USD";
    let quoted: QuoteResult | null = null;
    if (cross) {
      const q = await generateDisbursementQuote({
        businessId: cfg.businessId,
        sourceCurrency,
        destinationCurrency: "USD",
        receiveAmount: destAmount,
        paymentDestination: "bank_account",
        paymentScheme,
      });
      if (!q.ok) {
        attemptErrors.push(`${sourceCurrency}->USD quote: ${q.error}`);
        continue;
      }
      quoted = q.quote;
    }

    const customerReference = `${opts.transfer_id}__usd_${sourceCurrency}_${paymentScheme}_${Date.now().toString(36)}`;
    const payload: Record<string, unknown> = {
      business: cfg.businessId,
      sourceCurrency,
      destinationCurrency: "USD",
      description: `eFinMoney USD ${isSwift ? "SWIFT" : "ACH"} to ${opts.recipient_name}`,
      paymentDestination: "bank_account",
      paymentScheme,
      customerReference,
      beneficiary,
      feeBearer: "business",
      files: DEFAULT_USD_PURPOSE_FILE,
      sender,
      amount: cross && quoted
        ? Math.round(quoted.sourceAmount * 100) / 100
        : destAmount,
    };
    if (cross && quoted) payload.quoteReference = quoted.reference;

    const { ok, status, json } = await fincraFetch("/disbursements/payouts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const outcome = fincraPayoutAccepted(json as Record<string, unknown>);
    if (ok && outcome.accepted) {
      successJson = json as Record<string, unknown>;
      usedSource = sourceCurrency;
      usedCustomerReference = customerReference;
      usedQuote = quoted;
      break;
    }
    const reason = outcome.message
      || String((json as { error?: string; message?: string })?.error
        || (json as { message?: string })?.message
        || `HTTP ${status}`);
    attemptErrors.push(`${sourceCurrency} scheme=${paymentScheme}: ${reason}`);
    const lower = reason.toLowerCase();
    if (lower.includes("destination currency") && lower.includes("not supported")) {
      return jsonFail(
        "Fincra USD ACH/SWIFT payout is not enabled on this merchant — trying the next rail",
        "unavailable",
      );
    }
    if (sourceCurrency === "USD" && isFincraBalanceError(reason)) {
      usdWalletShort = true;
      continue;
    }
    if (isFincraBalanceError(reason) || isUnsupportedFundingError(reason)) continue;
  }

  if (!successJson) {
    const reason = (attemptErrors.length
      ? attemptErrors.join(" | ")
      : "Fincra USD payout failed").slice(0, 500);
    if (opts.skip_reversal) {
      return jsonFail(reason, classifyFincraError(reason) === "hard" ? "hard" : "unavailable");
    }
    const rev = await reverseTransferLedger(opts.supabase, opts.transfer_id);
    await opts.supabase.from("transfers").update({
      status: "failed",
      failure_reason: reason.slice(0, 500),
    }).eq("id", opts.transfer_id);
    return new Response(JSON.stringify({
      success: false,
      error: reason,
      error_class: "unavailable",
      retryable: true,
      refunded: rev.reversed,
      rail: "fincra",
      attempts: attemptErrors,
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const pdata = (successJson.data ?? {}) as Record<string, unknown>;
  const providerRef = String(pdata.reference || pdata.id || usedCustomerReference);
  await opts.supabase.from("transfers").update({
    status: "processing",
    provider_reference: providerRef,
    provider_charge_id: usedQuote
      ? `rail:fincra|src:${usedSource}|dst:USD|cref:${usedCustomerReference}|q:${usedQuote.reference}`
      : `rail:fincra|src:${usedSource}|dst:USD|cref:${usedCustomerReference}`,
  }).eq("id", opts.transfer_id);
  await opts.supabase.from("notifications").insert({
    user_id: opts.senderId,
    title: "Transfer initiated",
    message: `Your USD ${destAmount} transfer to ${opts.recipient_name} is being processed via Fincra.`,
    type: "info",
  });
  return new Response(JSON.stringify({
    success: true,
    reference: providerRef,
    rail: "fincra",
    source_currency: usedSource,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const body: PayoutRequest & { bank_details?: Record<string, unknown> } = await req.json();
    const { transfer_id, phone_number, account_number, bank_code, amount, currency, network, recipient_name, skip_reversal } = body;
    const bankDetailsFromBody = body.bank_details && typeof body.bank_details === "object"
      ? body.bank_details
      : null;
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

    const destCcy = String(currency || transfer.target_currency || transfer.source_currency || "").toUpperCase();
    const isDomesticCanada = String(transfer.transfer_type || "").toLowerCase() === "domestic_canada"
      || String(transfer.recipient_country || "").toUpperCase() === "CA"
      || destCcy === "CAD";
    if (destCcy === "CAD" || (isDomesticCanada && (destCcy === "CAD" || !currency))) {
      return await payoutCanadaCadViaFincra({
        supabase,
        transfer,
        transfer_id,
        senderId,
        amount: Number(amount || transfer.target_amount || transfer.source_amount),
        network: String(network || transfer.payout_method || ""),
        recipient_name: String(recipient_name || transfer.recipient_name || ""),
        skip_reversal: skip_reversal === true,
      });
    }

    const isDomesticUs = String(transfer.transfer_type || "").toLowerCase() === "domestic_us"
      || String(transfer.recipient_country || "").toUpperCase() === "US"
      || destCcy === "USD";
    const usdMethod = String(network || transfer.payout_method || "").toLowerCase();
    const isUsdBank = !usdMethod.includes("momo") && !usdMethod.includes("mpesa")
      && (usdMethod === "ach" || usdMethod === "wire" || usdMethod === "swift" || usdMethod === "bank" || !usdMethod);
    if (destCcy === "USD" && isDomesticUs && isUsdBank) {
      const transferWithDetails = bankDetailsFromBody
        ? { ...transfer, recipient_bank_details: bankDetailsFromBody, metadata: { ...(transfer as Record<string, unknown>).metadata as object || {}, bank_details: bankDetailsFromBody } }
        : transfer;
      return await payoutUsdViaFincra({
        supabase,
        transfer: transferWithDetails as Record<string, unknown>,
        transfer_id,
        senderId,
        amount: Number(amount || transfer.target_amount || transfer.source_amount),
        network: String(network || transfer.payout_method || ""),
        recipient_name: String(recipient_name || transfer.recipient_name || ""),
        skip_reversal: skip_reversal === true,
      });
    }

    const cfg = getFincraConfig();
    if (!cfg.secretKey || !cfg.businessId) {
      const reason = "Fincra is not configured";
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: reason,
        provider_reference: `STUB-FINCRA-${transfer_id.slice(0, 8)}`,
      }).eq("id", transfer_id);
      return new Response(
        JSON.stringify({ success: false, stub: true, error: reason, message: reason }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

    // Allow retry when status is failed but wallet was NOT refunded yet (rare).
    // If already reversed, caller must create a new Send — re-debit here risks double-refunds.
    const forceRetry = body.force_retry === true || String(transfer.status) === "failed";
    if (forceRetry) {
      const { data: revRows } = await supabase.from("ledger_entries").select("id")
        .eq("reference_type", "transfer_reversal").eq("reference_id", transfer_id).limit(1);
      if (revRows?.length) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "This payout already failed and was refunded to the wallet. Create a new Send to Mary (same number) — do not reuse this transfer id.",
            needs_new_send: true,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await supabase.from("transfers").update({
        status: "processing",
        failure_reason: null,
        provider_reference: `FINCRA-PENDING-${Date.now().toString(36)}`,
      }).eq("id", transfer_id);
    }

    const { firstName, lastName } = splitName(recipient_name || transfer.recipient_name || "Recipient");
    const ccy = currency.toUpperCase();
    const paymentDestination = hasBankRail ? "bank_account" as const : "mobile_money_wallet" as const;

    // Fincra MoMo / IMT examples include beneficiary.email + sender { name, email, phone }.
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", senderId)
      .maybeSingle();
    const senderEmail = String(senderProfile?.email || "").trim() || `noreply+${senderId.slice(0, 8)}@efin.money`;
    const senderName = String(senderProfile?.full_name || "eFinMoney Customer").trim();
    const senderPhoneRaw = String(senderProfile?.phone || phone_number || "254700000000");
    const senderPhone = fincraMsisdnDigits(senderPhoneRaw, ccy === "KES" ? "KES" : ccy);
    const beneficiaryEmail = senderEmail;

    let mmCode: string | null = null;
    let beneficiaryBase: Record<string, unknown>;
    let accountVariants: string[] = [];

    if (hasBankRail) {
      const storedCode = String(bank_code);
      const storedName = String(transfer.recipient_bank_name || "");
      // Try primary code first, then known aliases (e.g. OPay 100004 / 305).
      let codeVariants = ccy === "NGN"
        ? ngBankCodeCandidates(storedCode, storedName)
        : ccy === "GHS"
        ? await resolveGhBankSwiftCodes(storedCode, storedName)
        : [storedCode];
      if (!codeVariants.length) codeVariants = ccy === "GHS" ? [] : [storedCode];

      if (ccy === "GHS" && !codeVariants.length) {
        const reason =
          `Ghana bank “${storedName || storedCode}” is not on Fincra’s bank list (need a SWIFT code). Reselect the bank and retry.`;
        if (!skip_reversal) {
          const rev = await reverseTransferLedger(supabase, transfer_id);
          await supabase.from("transfers").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", transfer_id);
          return new Response(
            JSON.stringify({ success: false, error: reason, error_class: "hard", refunded: rev.reversed }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ success: false, error: reason, error_class: "hard", refunded: false }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Fincra GHS bank payouts expect bankSwiftCode (e.g. ABNGGHAC), not Flutterwave numeric bankCode.
      // Sending a FLW code as bankCode triggers: "Invalid beneficiary bankCode supplied."
      if (ccy === "GHS") {
        beneficiaryBase = {
          firstName,
          lastName,
          type: "individual",
          accountHolderName: recipient_name || transfer.recipient_name,
          accountNumber: String(account_number).replace(/\D/g, ""),
          bankSwiftCode: codeVariants[0] || storedCode,
          country: CURRENCY_TO_COUNTRY[ccy] || "GH",
        };
      } else {
        beneficiaryBase = {
          firstName,
          lastName,
          type: "individual",
          accountHolderName: recipient_name || transfer.recipient_name,
          accountNumber: String(account_number).replace(/\D/g, ""),
          bankCode: codeVariants[0] || storedCode,
          country: CURRENCY_TO_COUNTRY[ccy] || undefined,
        };
      }
      accountVariants = [String(account_number).replace(/\D/g, "")];
      // Also try alternate bank codes as separate outer attempts via networkVariants-style list
      // by expanding bankCode on each funding attempt below when payout fails.
      (beneficiaryBase as Record<string, unknown>)._bankCodeVariants = codeVariants;
    } else {
      mmCode = FINCRA_MM_CODE[`${ccy}:${network.toLowerCase()}`] || null;
      if (!mmCode) {
        const reason = `Unsupported network ${network} for ${ccy} on Fincra`;
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: reason }).eq("id", transfer_id);
        return new Response(JSON.stringify({ success: false, error: reason, refunded: rev.reversed }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const rawPhone = phone_number || transfer.recipient_phone || "";
      const holderName = (recipient_name || transfer.recipient_name || `${firstName} ${lastName}`).trim();
      // Reject malformed Zambian numbers before spending Fincra attempts on them.
      if (ccy === "ZMW") {
        const z = zmwMsisdn(rawPhone);
        if (!z.ok) {
          if (!skip_reversal) {
            const rev = await reverseTransferLedger(supabase, transfer_id);
            await supabase.from("transfers").update({ status: "failed", failure_reason: z.error }).eq("id", transfer_id);
            return new Response(
              JSON.stringify({ success: false, error: z.error, error_class: "hard", refunded: rev.reversed }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ success: false, error: z.error, error_class: "hard", refunded: false }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      accountVariants = fincraAccountNumberVariants(rawPhone, ccy);
      beneficiaryBase = {
        firstName,
        lastName,
        type: "individual",
        accountHolderName: holderName,
        phone: ccy === "ZMW" ? accountVariants[0] : fincraMsisdnDigits(rawPhone, ccy),
        country: CURRENCY_TO_COUNTRY[ccy] || "ZM",
        mobileMoneyCode: mmCode,
        email: beneficiaryEmail,
      };
    }


    // For Zambia / Kenya, if the selected network is rejected, also try other MoMo operators.
    const networkVariants: string[] = mmCode
      ? (ccy === "ZMW"
        ? [...new Set([mmCode, "AIRTEL", "MTN", "ZAMTEL"])]
        : ccy === "KES"
        ? [...new Set([mmCode, "SAFARICOM", "AIRTEL"])]
        : [mmCode])
      : [];

    // Destination amount the recipient should get.
    let destAmountNum = Number(amount);
    // AIRTEL requires whole amounts — use whole for all ZMW attempts for safety when probing networks.
    if (ccy === "UGX" || ccy === "ZMW" || mmCode === "AIRTEL") {
      destAmountNum = Math.round(destAmountNum);
    } else {
      destAmountNum = Math.round(destAmountNum * 100) / 100;
    }

    // Fincra KES MoMo fee is ~100 KES flat — sub-fee amounts fail with a vague "retry later".
    if (ccy === "KES" && !hasBankRail && destAmountNum < 150) {
      const reason =
        `Kenya MoMo via Fincra needs at least KES 150 (their fee is ~KES 100). You tried KES ${destAmountNum}.`;
      if (!skip_reversal) {
        const rev = await reverseTransferLedger(supabase, transfer_id);
        await supabase.from("transfers").update({ status: "failed", failure_reason: reason.slice(0, 500) }).eq("id", transfer_id);
        return new Response(
          JSON.stringify({ success: false, error: reason, error_class: "hard", refunded: rev.reversed }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: reason, error_class: "hard", refunded: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const preferred = preferredFundingCurrency(body, ccy);
    const candidates = fundingCandidates(preferred, ccy);
    const attemptErrors: string[] = [];
    let lastReason = "Fincra payout failed";
    let usedSource = ccy;
    let usedQuote: QuoteResult | null = null;
    let usedAccountNumber: string | null = null;
    let usedNetwork: string | null = mmCode;
    let usedCustomerReference = transfer_id;
    let successJson: Record<string, unknown> | null = null;
    // Set when the provider itself is down / erroring: stop probing, fail over instead.
    let outageClass: FincraErrorClass | null = null;

    let attemptNo = 0;
    const bankCodeVariants: string[] = hasBankRail
      ? ((beneficiaryBase as Record<string, unknown>)._bankCodeVariants as string[] || [String(bank_code)])
      : [null as unknown as string];
    delete (beneficiaryBase as Record<string, unknown>)._bankCodeVariants;

    for (const sourceCurrency of candidates) {
      if (successJson || outageClass) break;
      const cross = sourceCurrency !== ccy;

      for (const netCode of (networkVariants.length ? networkVariants : [null])) {
        if (successJson || outageClass) break;

        // AIRTEL requires whole destination amounts (Fincra docs).
        const attemptDestAmount = (!hasBankRail && netCode === "AIRTEL")
          ? Math.round(destAmountNum)
          : destAmountNum;

        for (const bankCodeTry of (hasBankRail ? bankCodeVariants : [null])) {
          if (successJson || outageClass) break;

        for (const accountNumber of accountVariants) {
          attemptNo += 1;
          // Always unique — Fincra rejects reuse after a failed/processing create (retry-safe).
          const customerReference = `${transfer_id}__${attemptNo}_${Date.now().toString(36)}`;
          const beneficiary = hasBankRail
            ? (ccy === "GHS"
              ? {
                firstName: beneficiaryBase.firstName,
                lastName: beneficiaryBase.lastName,
                type: "individual",
                accountHolderName: beneficiaryBase.accountHolderName,
                accountNumber,
                country: beneficiaryBase.country || "GH",
                bankSwiftCode: bankCodeTry || beneficiaryBase.bankSwiftCode,
                email: beneficiaryEmail,
              }
              : {
                ...beneficiaryBase,
                accountNumber,
                bankCode: bankCodeTry || beneficiaryBase.bankCode,
                email: beneficiaryEmail,
              })
            : {
              ...beneficiaryBase,
              accountNumber,
              phone: accountNumber.startsWith("260") || accountNumber.startsWith("254") || accountNumber.startsWith("233")
                ? accountNumber
                : ((beneficiaryBase.phone as string) || accountNumber),
              email: beneficiaryEmail,
              ...(netCode ? { mobileMoneyCode: netCode } : {}),
            };

          let quoted: QuoteResult | null = null;
          if (cross) {
            const q = await generateDisbursementQuote({
              businessId: cfg.businessId!,
              sourceCurrency,
              destinationCurrency: ccy,
              receiveAmount: attemptDestAmount,
              paymentDestination,
            });
            if (!q.ok) {
              attemptErrors.push(`${sourceCurrency}->${ccy} quote: ${q.error}`);
              // Never let a later quote miss overwrite a real same-currency bank error.
              if (!isUnsupportedFundingError(q.error) && !attemptErrors.some((a) => a.includes(`${ccy}->${ccy}`))) {
                lastReason = q.error;
              }
              // Skip this funding currency entirely.
              break;
            }
            quoted = q.quote;
          }

          const payload: Record<string, unknown> = {
            business: cfg.businessId,
            sourceCurrency,
            destinationCurrency: ccy,
            description: `eFinMoney transfer to ${recipient_name || transfer.recipient_name}`,
            paymentDestination,
            customerReference,
            beneficiary,
            amount: cross && quoted
              ? String(Math.round(quoted.sourceAmount * 100) / 100)
              : String(attemptDestAmount),
          };
          if (cross && quoted) payload.quoteReference = quoted.reference;
          // Cross-currency MoMo (IMT) examples include sender — omit only for same-currency bank.
          if (!hasBankRail || cross) {
            payload.sender = {
              name: senderName,
              email: senderEmail,
              phone: senderPhone,
              type: "individual",
              // IMT examples include address — omit → vague KE failures on some merchants.
              address: cross
                ? "eFinMoney, Lagos, Nigeria"
                : undefined,
              sourceOfFunds: cross ? "Personal" : undefined,
              nationality: cross ? "NG" : undefined,
              countryOfOrigin: cross ? "NG" : undefined,
            };
            // Drop undefined keys
            const s = payload.sender as Record<string, unknown>;
            for (const k of Object.keys(s)) {
              if (s[k] === undefined) delete s[k];
            }
          }

          console.log("fincra-payout attempt", {
            transfer_id,
            customerReference,
            sourceCurrency,
            destinationCurrency: ccy,
            cross,
            accountNumber,
            mobileMoneyCode: netCode || mmCode,
            amount: payload.amount,
            quoteReference: quoted?.reference ?? null,
          });

          const { ok, status, json } = await fincraFetch("/disbursements/payouts", {
            method: "POST",
            body: JSON.stringify(payload),
          });

          const outcome = fincraPayoutAccepted(json as Record<string, unknown>);
          if (ok && outcome.accepted) {
            usedSource = sourceCurrency;
            usedQuote = quoted;
            usedAccountNumber = accountNumber;
            usedNetwork = netCode || mmCode;
            usedCustomerReference = customerReference;
            successJson = json as Record<string, unknown>;
            break;
          }

          let reason = outcome.message
            || String((json as any)?.error || (json as any)?.message || `HTTP ${status}`);
          // Pull richer failure text when create returns status=failed.
          if (ok && !outcome.accepted) {
            const detail = await fincraFetch(
              `/disbursements/payouts/customer-reference/${encodeURIComponent(customerReference)}`,
              { method: "GET", withBusinessId: true },
            );
            const d = (detail.json?.data ?? {}) as Record<string, unknown>;
            const richer = String(d.message || d.reason || d.failureReason || "");
            if (richer) reason = richer;
            reason = `${reason} [fincra:${outcome.status || "failed"} ref=${d.reference || outcome.data.reference || "?"}]`;
          }

          attemptErrors.push(
            `${sourceCurrency}->${ccy} bank=${bankCodeTry || mmCode || "—"} acct=${accountNumber}: ${reason}`,
          );
          lastReason = reason;

          const cls = classifyFincraError(reason);
          if (cls === "corridor_down" || cls === "transient") {
            // Upstream problem — every network returns the same thing. Stop probing
            // and let the caller fail over to another rail.
            outageClass = cls;
            break;
          }
          if (isFincraAccountNumberError(reason)) {
            continue; // try next MSISDN shape
          }
          // Wrong mobileMoneyCode for this corridor — try the next operator (don't wipe MSISDNs).
          if (/mobile\s*money\s*code/i.test(reason) && /not supported/i.test(reason)) {
            break; // next bankCodeTry / netCode with same accountVariants
          }
          if (
            (reason.toLowerCase().includes("not supported") && !isUnsupportedFundingError(reason)) ||
            reason.toLowerCase().includes("unsupported")
          ) {
            accountVariants.length = 0;
            break;
          }
          if (isFincraBalanceError(reason) || isUnsupportedFundingError(reason)) {
            break;
          }
          // Other hard errors — try next bank-code / network once, else stop this funding wallet.
          break;

        } // accountNumber
        } // bankCodeTry
        if (isFincraBalanceError(lastReason)) break;
      }
    }

    if (!successJson) {
      // Prefer real bank/payout failures over later cross-currency quote noise.
      const bestAttempt = [...attemptErrors].reverse().find((a) =>
        a.includes("fincra:failed") || isFincraTransientPayoutError(a) || isFincraAccountNumberError(a)
      ) || attemptErrors.find((a) => a.includes(`${ccy}->${ccy}`) && !a.includes("quote:"))
        || attemptErrors.find((a) => !a.includes("quote:"))
        || attemptErrors[attemptErrors.length - 1]
        || lastReason;
      const reason = bestAttempt.includes(": ")
        ? bestAttempt.slice(bestAttempt.indexOf(": ") + 2)
        : lastReason;
      const isBalanceError = isFincraBalanceError(reason);
      const errorClass: FincraErrorClass = outageClass ?? classifyFincraError(reason);
      const detail = attemptErrors.length > 1
        ? `${reason} (tried: ${attemptErrors.join(" | ")})`
        : reason;
      // Lead with a customer-safe sentence, keep the provider text behind it.
      const customerMessage = errorClass === "hard"
        ? reason
        : `${ccy === "ZMW" ? "Zambia mobile money" : `${ccy} payouts`} is temporarily unavailable — your funds have not left your wallet. ${reason}`;

      if (isBalanceError) {
        try {
          await supabase.from("admin_notifications").insert({
            title: "Fincra wallet balance low",
            message: `Payout for transfer ${transfer_id} failed across funding wallets: ${detail}. Preferred source=${preferred}, dest=${ccy}.`,
            type: "treasury",
          });
        } catch {
          /* non-blocking — Postgrest builders are thenable, not Promise (no .catch) */
        }
      }

      if (skip_reversal) {
        return new Response(JSON.stringify({
          success: false,
          error: reason,
          error_class: errorClass,
          retryable: errorClass !== "hard",
          refunded: false,
          attempts: attemptErrors,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: `${customerMessage} (tried: ${attemptErrors.join(" | ")})`.slice(0, 500),
      }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: senderId,
        title: "Transfer failed — refunded",
        message: rev.reversed ? `${customerMessage} Funds returned to your wallet.` : customerMessage,
        type: "error",
      });
      return new Response(JSON.stringify({
        success: false,
        error: customerMessage,
        error_class: errorClass,
        retryable: errorClass !== "hard",
        refunded: rev.reversed,
        attempts: attemptErrors,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    }

    const pdata = (successJson?.data ?? {}) as Record<string, unknown>;
    const providerRef = String(pdata.reference || pdata.id || usedCustomerReference);
    await supabase.from("transfers").update({
      status: "processing",
      provider_reference: providerRef,
      provider_charge_id: usedQuote
        ? `rail:fincra|src:${usedSource}|dst:${ccy}|net:${usedNetwork || "?"}|acct:${usedAccountNumber || "?"}|cref:${usedCustomerReference}|q:${usedQuote.reference}`
        : `rail:fincra|src:${usedSource}|dst:${ccy}|net:${usedNetwork || "?"}|acct:${usedAccountNumber || "?"}|cref:${usedCustomerReference}`,
    }).eq("id", transfer_id);
    await supabase.from("notifications").insert({
      user_id: senderId,
      title: "Transfer initiated",
      message: usedSource === ccy
        ? `Your ${ccy} ${destAmountNum} transfer to ${recipient_name || transfer.recipient_name} is being processed via Fincra.`
        : `Your ${ccy} ${destAmountNum} transfer (funded from Fincra ${usedSource}) to ${recipient_name || transfer.recipient_name} is being processed via Fincra.`,
      type: "info",
    });

    return new Response(JSON.stringify({
      success: true,
      reference: providerRef,
      status: pdata.status,
      source_currency: usedSource,
      destination_currency: ccy,
      quote_reference: usedQuote?.reference ?? null,
      amount_charged: usedQuote?.amountToCharge ?? destAmountNum,
      amount_to_receive: usedQuote?.amountToReceive ?? destAmountNum,
      attempts: attemptErrors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
