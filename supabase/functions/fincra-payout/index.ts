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
  /** Preferred Fincra wallet to debit (e.g. NGN). Falls back to FINCRA_PAYOUT_SOURCE_CURRENCY. */
  source_currency?: string;
  fincra_source_currency?: string;
  // When true (set by execute-transfer for fallback logic), on Fincra API failure
  // skip the ledger reversal and status update — execute-transfer will handle them.
  skip_reversal?: boolean;
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

/** Currencies we will try as Fincra funding wallets (after preferred). */
const DEFAULT_FUNDING_FALLBACKS = ["NGN", "USD", "GHS", "KES", "ZMW"];

const DIAL_BY_CURRENCY: Record<string, string> = {
  NGN: "234",
  KES: "254",
  GHS: "233",
  UGX: "256",
  TZS: "255",
  ZMW: "260",
  RWF: "250",
};

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Recipient", lastName: "User" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
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
    || m.includes("service unavailable");
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
  // Zambia is strictly NGN -> USD -> ZMW. Never let env fallbacks pull in a wallet
  // (RWF/UGX/…) that Fincra cannot quote from — that produced the
  // "No currency supported to make payout to, from RWF" failures.
  if (dest === "ZMW") {
    const allowed = ["NGN", "USD", "ZMW"];
    const list = allowed.includes(preferred)
      ? [preferred, ...allowed.filter((c) => c !== preferred)]
      : allowed;
    return list;
  }
  // MoMo corridors: don't wander into random wallets that can't fund the quote.
  const defaults = ["KES", "GHS"].includes(dest)
    ? ["NGN", "USD", dest]
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
    || m.includes("unsupported currency");
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
}): Promise<{ ok: true; quote: QuoteResult } | { ok: false; error: string }> {
  const amountStr = String(opts.receiveAmount);
  const { ok, status, json } = await fincraFetch("/quotes/generate", {
    method: "POST",
    body: JSON.stringify({
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
    }),
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
    const { transfer_id, phone_number, account_number, bank_code, amount, currency, network, recipient_name, skip_reversal } = body;
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

    const { firstName, lastName } = splitName(recipient_name || transfer.recipient_name || "Recipient");
    const ccy = currency.toUpperCase();
    const paymentDestination = hasBankRail ? "bank_account" as const : "mobile_money_wallet" as const;

    let mmCode: string | null = null;
    let beneficiaryBase: Record<string, unknown>;
    let accountVariants: string[] = [];

    if (hasBankRail) {
      beneficiaryBase = {
        firstName,
        lastName,
        type: "individual",
        accountHolderName: recipient_name || transfer.recipient_name,
        accountNumber: String(account_number).replace(/\D/g, ""),
        bankCode: String(bank_code),
        country: CURRENCY_TO_COUNTRY[ccy] || undefined,
      };
      accountVariants = [String(account_number).replace(/\D/g, "")];
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
      };
    }


    // For Zambia, if the selected network is rejected, also try the other MoMo operators.
    const networkVariants: string[] = mmCode
      ? (ccy === "ZMW"
        ? [...new Set([mmCode, "AIRTEL", "MTN", "ZAMTEL"])]
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
    for (const sourceCurrency of candidates) {
      if (successJson || outageClass) break;
      const cross = sourceCurrency !== ccy;

      for (const netCode of (networkVariants.length ? networkVariants : [null])) {
        if (successJson || outageClass) break;


        for (const accountNumber of accountVariants) {
          attemptNo += 1;
          // Unique per attempt — Fincra rejects reuse of the same customerReference after a failed create.
          const customerReference = attemptNo === 1 ? transfer_id : `${transfer_id}__${attemptNo}`;
          const beneficiary = hasBankRail
            ? { ...beneficiaryBase, accountNumber }
            : {
              ...beneficiaryBase,
              accountNumber,
              phone: accountNumber.startsWith("260") || accountNumber.startsWith("254") || accountNumber.startsWith("233")
                ? accountNumber
                : ((beneficiaryBase.phone as string) || accountNumber),
              ...(netCode ? { mobileMoneyCode: netCode } : {}),
            };

          let quoted: QuoteResult | null = null;
          if (cross) {
            const q = await generateDisbursementQuote({
              businessId: cfg.businessId!,
              sourceCurrency,
              destinationCurrency: ccy,
              receiveAmount: destAmountNum,
              paymentDestination,
            });
            if (!q.ok) {
              attemptErrors.push(`${sourceCurrency}->${ccy} quote: ${q.error}`);
              // Don't bury a real NGN payout failure under later "RWF not supported".
              if (!isUnsupportedFundingError(q.error)) {
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
              : String(destAmountNum),
          };
          if (cross && quoted) payload.quoteReference = quoted.reference;

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

          attemptErrors.push(`${sourceCurrency}->${ccy} net=${netCode || mmCode} acct=${accountNumber}: ${reason}`);
          lastReason = reason;

          if (isFincraAccountNumberError(reason)) {
            continue; // try next MSISDN shape
          }
          if (isFincraTransientPayoutError(reason)) {
            // Format was accepted by Fincra then failed downstream — try next network with same good MSISDNs.
            break;
          }
          if (
            reason.toLowerCase().includes("maintenance") ||
            (reason.toLowerCase().includes("not supported") && !isUnsupportedFundingError(reason)) ||
            reason.toLowerCase().includes("unsupported")
          ) {
            accountVariants.length = 0;
            break;
          }
          if (isFincraBalanceError(reason) || isUnsupportedFundingError(reason)) {
            break;
          }
          // Other hard errors — try next network once, else stop this funding wallet.
          break;
        }
        if (isFincraBalanceError(lastReason)) break;
      }
    }

    if (!successJson) {
      // Prefer the most useful attempt line over a later "RWF not supported" quote error.
      const bestAttempt = [...attemptErrors].reverse().find((a) =>
        a.includes("fincra:failed") || isFincraTransientPayoutError(a) || isFincraAccountNumberError(a)
      ) || attemptErrors[attemptErrors.length - 1] || lastReason;
      const reason = bestAttempt.includes(": ")
        ? bestAttempt.slice(bestAttempt.indexOf(": ") + 2)
        : lastReason;
      const isBalanceError = isFincraBalanceError(reason);
      const detail = attemptErrors.length > 1
        ? `${reason} (tried: ${attemptErrors.join(" | ")})`
        : reason;

      if (isBalanceError) {
        await supabase.from("admin_notifications").insert({
          title: "Fincra wallet balance low",
          message: `Payout for transfer ${transfer_id} failed across funding wallets: ${detail}. Preferred source=${preferred}, dest=${ccy}.`,
          type: "treasury",
        }).catch(() => {/* non-blocking */});
      }

      if (skip_reversal) {
        return new Response(JSON.stringify({
          success: false,
          error: reason,
          refunded: false,
          attempts: attemptErrors,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const rev = await reverseTransferLedger(supabase, transfer_id);
      await supabase.from("transfers").update({ status: "failed", failure_reason: detail.slice(0, 500) }).eq("id", transfer_id);
      await supabase.from("notifications").insert({
        user_id: senderId,
        title: "Transfer failed — refunded",
        message: rev.reversed ? `${reason}. Funds returned to your wallet.` : reason,
        type: "error",
      });
      return new Response(JSON.stringify({
        success: false,
        error: reason,
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
