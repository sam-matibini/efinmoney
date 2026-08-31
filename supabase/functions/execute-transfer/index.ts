import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { dispatchRoutedPayout } from "../_shared/routingExecute.ts";
import { observeRoute } from "../_shared/routeResolver.ts";
import { recordEconomics } from "../_shared/transactionEconomics.ts";
import { assertQuotedFee } from "../_shared/pricingService.ts";
import { isLivePayoutCurrency } from "../_shared/retailPayoutFees.ts";
import { payoutFnForRail, resolveCorridorRails } from "../_shared/corridor-rails.ts";
import { explainPayoutError, notifyOpsBrief, notifyOpsFailoverPing } from "../_shared/ops-alert.ts";
import { validatePayoutMin } from "../_shared/payoutMins.ts";
import { nombaApiConfigured } from "../_shared/nomba-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

// Map destination currency -> mobile money payable account code
const PAYABLE_BY_CURRENCY: Record<string, string> = {
  KES: "2120",
  UGX: "2121",
  TZS: "2122",
  ZMW: "2123",
  BIF: "2124",
  NGN: "2125",
  GHS: "2126",
};

// Map our internal payout_method codes -> Flutterwave network token used by V3_MM_BANK
const PAYOUT_METHOD_TO_NETWORK: Record<string, string> = {
  mtn_mobile: "mtn",
  airtel_money: "airtel",
  airteltigo_money: "airtel",
  zamtel_money: "zamtel",
  vodafone_cash: "vodafone",
  vodafone_money: "vodafone",
  tigo_pesa: "tigo",
  mpesa: "mpesa",
  bank: "bank",
};

// Fallback default network per destination currency when payout_method is generic ("mobile_money") or unknown
const CURRENCY_DEFAULT_NETWORK: Record<string, string> = {
  KES: "mpesa",
  ZMW: "mtn",
  GHS: "mtn",
  UGX: "mtn",
  TZS: "airtel",
  RWF: "mtn",
};

function resolveNetwork(payoutMethod: string | null | undefined, currency: string): string {
  if (payoutMethod && PAYOUT_METHOD_TO_NETWORK[payoutMethod]) {
    return PAYOUT_METHOD_TO_NETWORK[payoutMethod];
  }
  const lower = (payoutMethod ?? "").toLowerCase().trim();
  if (["mtn", "airtel", "zamtel", "mpesa", "vodafone", "tigo"].includes(lower)) {
    return lower;
  }
  return CURRENCY_DEFAULT_NETWORK[currency] || "mpesa";
}

const PAWAPAY_SUPPORTED_COUNTRY_HINTS = new Set([
  "SENEGAL", "CAMEROON", "IVORY COAST", "BURKINA FASO", "BENIN",
  "KENYA", "UGANDA", "TANZANIA", "RWANDA", "ZAMBIA", "GHANA", "MALAWI",
]);

const PAWAPAY_SUPPORTED_COUNTRY_CODES = new Set([
  "SN", "CM", "CI", "BF", "BJ", "KE", "UG", "TZ", "RW", "ZM", "GH", "MW",
]);

const PAWAPAY_SUPPORTED_CURRENCIES = new Set(["KES", "UGX", "TZS", "RWF", "ZMW", "GHS", "MWK"]);

function isMobileMoneyPayoutMethod(payoutMethod: string | null | undefined): boolean {
  const method = (payoutMethod ?? "").toLowerCase();
  return method.includes("mobile") || method.includes("money") || [
    "mtn_mobile",
    "airtel_money",
    "zamtel_money",
    "mpesa",
    "vodafone_cash",
    "vodafone_money",
    "tigo_pesa",
    "airteltigo_money",
    "mobile_money",
    "mtn",
    "airtel",
    "zamtel",
  ].includes(method);
}

function isPawapayEligible(
  recipientCountry: string,
  targetCurrency: string,
  payoutMethod: string | null | undefined,
  recipientCountryHint?: string | null,
): boolean {
  const hint = (recipientCountryHint ?? "").trim().toUpperCase();
  if (PAWAPAY_SUPPORTED_COUNTRY_HINTS.has(hint)) return true;
  if (PAWAPAY_SUPPORTED_COUNTRY_CODES.has(recipientCountry)) return true;
  return isMobileMoneyPayoutMethod(payoutMethod) && PAWAPAY_SUPPORTED_CURRENCIES.has(targetCurrency);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isInternal =
      Boolean(serviceKey) &&
      (bearer === serviceKey || req.headers.get("x-internal-secret") === serviceKey);

    const payload: Record<string, any> = (await req.json().catch(() => ({}))) || {};
    const { transfer_id } = payload;
    if (!transfer_id) {
      return new Response(JSON.stringify({ error: "transfer_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let user: { id: string } | null = null;
    if (isInternal) {
      const { data: trRow } = await supabase
        .from("transfers")
        .select("sender_id")
        .eq("id", transfer_id)
        .maybeSingle();
      if (!trRow?.sender_id) {
        return new Response(JSON.stringify({ error: "Transfer not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = { id: trRow.sender_id };
    } else {
      const { data: { user: authUser } } = await supabase.auth.getUser(bearer);
      if (!authUser) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = authUser;
    }

    const forceFincraOnly = payload.force_rail === "fincra_only";
    if (forceFincraOnly) {
      const expectedToken = (Deno.env.get("ZAMBIA_FINCRA_TEST_TOKEN") || "efm-zm-fincra-7f3a9c").trim();
      if (!payload.ops_token || String(payload.ops_token) !== expectedToken) {
        return new Response(JSON.stringify({ error: "Invalid ops token" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await supabase.rpc("is_admin_user", { _uid: user.id });
      const allowUids = (Deno.env.get("ZAMBIA_FINCRA_TEST_UIDS") || "1bd0b5b8-a3ae-490c-8614-c45d5bf897e2")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!isAdmin && !allowUids.includes(user.id)) {
        return new Response(JSON.stringify({ error: "Not allowed to use Fincra Zambia ops payout" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Load transfer
    const { data: transfer, error: tErr } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .eq("sender_id", user.id)
      .single();

    if (tErr || !transfer) {
      return new Response(JSON.stringify({ error: "Transfer not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Block payout while a linked Interac/Loop pay-in is still unpaid.
    const { data: unpaidIntent } = await supabase
      .from("fincra_cad_interac_intents")
      .select("id, status, reference")
      .eq("transfer_id", transfer_id)
      .in("status", ["pending", "awaiting_payment"])
      .maybeSingle();
    if (unpaidIntent) {
      return new Response(JSON.stringify({
        error: "Awaiting Loop Bank deposit — payout releases after Interac/EFT is matched",
        code: "awaiting_loop_deposit",
        reference: unpaidIntent.reference,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (forceFincraOnly) {
      const ccy = String(transfer.target_currency || transfer.source_currency || "").toUpperCase();
      const country = String(transfer.recipient_country || "").toUpperCase();
      if (ccy !== "ZMW" || (country && country !== "ZM" && country !== "ZAMBIA")) {
        return new Response(JSON.stringify({ error: "Fincra ops path is Zambia ZMW only" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (transfer.status !== "initiated") {
      return new Response(JSON.stringify({ error: `Transfer already ${transfer.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    {
      const destCcy = String(transfer.target_currency || "").toUpperCase();
      const destCountry = String(transfer.recipient_country || "").toUpperCase();
      if (!isLivePayoutCurrency(destCcy) && !isLivePayoutCurrency(destCountry)) {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: "Payouts to this country are coming soon",
        }).eq("id", transfer_id);
        return new Response(JSON.stringify({
          error: "Payouts to this country are coming soon. Live corridors: Ghana, Kenya, Zambia, Nigeria, Canada, and the United States.",
          code: "corridor_coming_soon",
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!Number(transfer.target_amount) || Number(transfer.target_amount) <= 0) {
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "Amount too small after fees — recipient would receive 0",
      }).eq("id", transfer_id);
      return new Response(JSON.stringify({
        error: "Amount too small: after fees the recipient would receive 0. Please increase the send amount.",
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    {
      const destCcy = String(transfer.target_currency || transfer.source_currency || "").toUpperCase();
      const destAmt = Number(transfer.target_amount);
      const minErr = validatePayoutMin(destCcy, destAmt);
      if (minErr) {
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: minErr.slice(0, 500),
        }).eq("id", transfer_id);
        return new Response(JSON.stringify({ error: minErr, code: "below_payout_minimum" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const isCardFunded = (payload.funding_source || transfer.funding_source) === "card";

    // Wallet / bank-funded (Interac prepaid): require real ledger balance before payout.
    if (!isCardFunded && transfer.sender_wallet_id) {
      const needed = Number(transfer.source_amount) + Number(transfer.fee_amount || 0);
      const { data: balRows } = await supabase
        .from("ledger_entries")
        .select("credit_amount, debit_amount")
        .eq("wallet_id", transfer.sender_wallet_id);
      const balance = (balRows ?? []).reduce(
        (sum, row) => sum + Number(row.credit_amount || 0) - Number(row.debit_amount || 0),
        0,
      );
      if (needed > balance + 1e-6) {
        return new Response(JSON.stringify({
          error: "Insufficient wallet balance — wait for Loop/Wise deposit to credit before payout",
          code: "insufficient_balance",
          balance,
          needed,
        }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // For card-funded transfers, charge the sender's card BEFORE posting any ledger.
    // If the charge fails, we never touch the ledger and the transfer is marked failed.
    // If the caller already charged the card upstream (e.g. via stripe-charge-saved-card),
    // they pass `prefunded: true` and we skip the re-charge — only record the reference.
    if (isCardFunded) {
      if (payload.prefunded) {
        if (payload.charge_reference) {
          await supabase.from("transfers")
            .update({ provider_reference: String(payload.charge_reference) })
            .eq("id", transfer_id);
        }
      } else {
        const cardToken = payload.card_token;
        if (!cardToken) {
          await supabase.from("transfers").update({
            status: "failed", failure_reason: "Missing card token for card-funded transfer",
          }).eq("id", transfer_id);
          return new Response(JSON.stringify({ success: false, error: "card_token required for card funding" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const totalCents = Math.round((Number(transfer.source_amount) + Number(transfer.fee_amount || 0)) * 100);
        const chargeRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-charge-card`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
            },
            body: JSON.stringify({
              transfer_id,
              card_token: cardToken,
              amount_cents: totalCents,
              currency: (transfer.source_currency || "cad").toLowerCase(),
            }),
          },
        );
        const chargeJson = await chargeRes.json();
        if (!chargeJson?.success) {
          await supabase.from("transfers").update({
            status: "failed",
            failure_reason: chargeJson?.error || "Card charge failed",
          }).eq("id", transfer_id);
          return new Response(JSON.stringify({
            success: false,
            error: chargeJson?.error || "Card charge failed",
            code: chargeJson?.code,
          }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // Idempotency: skip if already has a journal posted
    const { data: existing } = await supabase
      .from("ledger_entries")
      .select("id")
      .eq("reference_type", "transfer")
      .eq("reference_id", transfer_id)
      .limit(1);

    if (!existing || existing.length === 0) {
      // Look up debit account: card-funded → 1102 Stripe Card Receivable;
      // wallet-funded → customer wallet liability (21xx).
      const liabLookup = isCardFunded
        ? await supabase.from("ledger_accounts").select("id").eq("code", "1102").maybeSingle()
        : await supabase.from("ledger_accounts").select("id")
            .like("code", "21%").eq("currency_code", transfer.source_currency).limit(1).single();
      const liabAcc = liabLookup.data;

      // Canadian payouts settle through Paysafe — credit the Paysafe Settlement clearing account.
      // All other corridors credit the country's mobile-money payable account.
      const isCanadaPayout =
        transfer.transfer_type === "domestic_canada" || transfer.recipient_country === "CA";
      const payableCode = isCanadaPayout ? "1203" : PAYABLE_BY_CURRENCY[transfer.target_currency];
      const { data: payableAcc } = payableCode
        ? await supabase.from("ledger_accounts").select("id").eq("code", payableCode).maybeSingle()
        : { data: null };

      const { data: feeAcc } = await supabase
        .from("ledger_accounts").select("id").eq("code", "4200").maybeSingle();

      if (!liabAcc) {
        return new Response(JSON.stringify({ error: `No ledger account for ${transfer.source_currency}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Re-quote the fee from the central rate card so the ledger always reflects
      // the canonical price, not whatever the client sent at creation time.
      const { fee: quotedFee, quote: feeQuote, matched: feeMatched, claimed: claimedFee } =
        await assertQuotedFee(
          supabase,
          {
            direction: "payout",
            sourceCurrency: transfer.source_currency,
            destCurrency: transfer.target_currency ?? transfer.source_currency,
            destCountry: transfer.recipient_country ?? null,
            paymentMethod: transfer.payout_method ?? null,
            customerType: "consumer",
            amount: Number(transfer.source_amount),
          },
          transfer.fee_amount,
        );

      if (!feeMatched && !feeQuote.pricingMissing) {
        console.warn(
          `[pricing] fee variance on ${transfer_id}: claimed=${claimedFee} quoted=${quotedFee}`,
        );
        await supabase.from("transfers").update({ fee_amount: quotedFee }).eq("id", transfer_id);
        transfer.fee_amount = quotedFee;
      }

      const journalId = crypto.randomUUID();
      const feeAmount = Number(transfer.fee_amount || 0);
      const totalDebit = Number(transfer.source_amount) + feeAmount;


      const entries: any[] = [
        {
          journal_id: journalId,
          account_id: liabAcc.id,
          wallet_id: isCardFunded ? null : transfer.sender_wallet_id,
          currency_code: transfer.source_currency,
          debit_amount: totalDebit,
          credit_amount: 0,
          description: isCardFunded
            ? `Card-funded transfer to ${transfer.recipient_name} (${transfer.recipient_country})`
            : `Transfer to ${transfer.recipient_name} (${transfer.recipient_country})`,
          reference_type: "transfer",
          reference_id: transfer_id,
          created_by: user.id,
        },
      ];

      if (payableAcc) {
        // Credit payable in source currency so the journal balances within one currency.
        // (target_amount in a foreign currency would make raw debit ≠ credit totals.)
        entries.push({
          journal_id: journalId,
          account_id: payableAcc.id,
          wallet_id: null,
          currency_code: transfer.source_currency,
          debit_amount: 0,
          credit_amount: Number(transfer.source_amount),
          description: isCanadaPayout
            ? `Paysafe payout to ${transfer.recipient_name} (${transfer.payout_method || "interac"})`
            : `Payable to ${transfer.recipient_name}`,
          reference_type: "transfer",
          reference_id: transfer_id,
          created_by: user.id,
        });
      }

      if (feeAcc && feeAmount > 0) {
        entries.push({
          journal_id: journalId,
          account_id: feeAcc.id,
          wallet_id: null,
          currency_code: transfer.source_currency,
          debit_amount: 0,
          credit_amount: feeAmount,
          description: "Transfer fee revenue",
          reference_type: "transfer",
          reference_id: transfer_id,
          created_by: user.id,
        });
      }

      const { error: leErr } = await supabase.from("ledger_entries").insert(entries);
      if (leErr) {
        console.error("Ledger insert error:", leErr);
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: leErr.message,
        }).eq("id", transfer_id);
        return new Response(JSON.stringify({ error: "Failed to post ledger" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Mark funded
    await supabase.from("transfers").update({ status: "funded" }).eq("id", transfer_id);

    // Smart Route: Paysafe (Interac/EFT) for Canada; Stellar SEP-31 anchor for opt-in
    // African corridors (NG/KE/ZM); Flutterwave for the rest.
    const STELLAR_COUNTRIES = new Set(["NG", "KE", "ZM"]);
    const MTN_COUNTRIES = new Set(["GH", "UG", "ZM"]);
    const recipientCountry = (transfer.recipient_country ?? "").toUpperCase();
    const targetCurrency = (transfer.target_currency ?? "").toUpperCase();
    const recipientCountryHint = typeof payload.recipient_country_hint === "string"
      ? payload.recipient_country_hint
      : null;
    const isZambia =
      targetCurrency === "ZMW" ||
      recipientCountry === "ZM" ||
      (recipientCountryHint ?? "").trim().toUpperCase() === "ZAMBIA";
    const isKenya =
      targetCurrency === "KES" ||
      recipientCountry === "KE" ||
      recipientCountry === "KENYA" ||
      (recipientCountryHint ?? "").trim().toUpperCase() === "KENYA";
    const isMobileMoneyMethod = isMobileMoneyPayoutMethod(transfer.payout_method);
    const usePawapay =
      (payload.use_pawapay === true || transfer.use_pawapay === true) &&
      isMobileMoneyMethod &&
      isPawapayEligible(recipientCountry, targetCurrency, transfer.payout_method, recipientCountryHint);
    const useMtnMomo = false;

    const useStellar =
      !useMtnMomo && !isZambia &&
      (payload.use_stellar === true || transfer.use_stellar === true) &&
      STELLAR_COUNTRIES.has(recipientCountry);

    const isCanada = transfer.transfer_type === "domestic_canada" || transfer.recipient_country === "CA";
    const isGhana =
      targetCurrency === "GHS" ||
      recipientCountry === "GH" ||
      recipientCountry === "GHANA" ||
      (recipientCountryHint ?? "").trim().toUpperCase() === "GHANA";

    const fincraConfigured = !!(
      Deno.env.get("FINCRA_SECRET_KEY")?.trim()
      && Deno.env.get("FINCRA_BUSINESS_ID")?.trim()
    );
    const FINCRA_MOMO = new Set(["KES", "GHS", "UGX", "TZS", "ZMW", "RWF"]);
    const isNigeriaBank =
      targetCurrency === "NGN" &&
      transfer.payout_method === "bank" &&
      !!transfer.recipient_account &&
      !!transfer.recipient_bank_code;
    const isGhanaBank =
      targetCurrency === "GHS" &&
      (transfer.payout_method === "bank" || String(transfer.payout_method || "").toLowerCase() === "bank") &&
      !!transfer.recipient_account &&
      !!transfer.recipient_bank_code;

    // Corridors Fincra can serve → fixed priority chain (not random).
    // Order: Nomba (default) → Fincra → Flutterwave → … when no admin policy.
    // EXCEPTION: Zambia MoMo stays Fincra-only (Nomba does not support ZMW).
    const fincraCapable =
      !isCanada
      && transfer.payout_method !== "card_push"
      && (
        (isMobileMoneyMethod && FINCRA_MOMO.has(targetCurrency))
        || isNigeriaBank
        || isGhanaBank
      );
    // Zambia MoMo is Fincra-exclusive: Nomba has no ZMW corridor.
    const zambiaMomo = isMobileMoneyMethod && (isZambia || targetCurrency === "ZMW");
    const fincraExclusiveCorridor = zambiaMomo;
    // Kenya is Nomba-exclusive: no failover to Fincra/Flovide/Flutterwave/Paytota/Swychr.
    const kenyaNombaExclusive =
      (isKenya || targetCurrency === "KES") && transfer.payout_method !== "card_push";



    const paytotaMomoCurrencies = new Set(["UGX", "KES", "RWF"]);
    const paytotaCapable = isMobileMoneyMethod && paytotaMomoCurrencies.has(targetCurrency);
    const swychrEnabled = Deno.env.get("SWYCHR_ENABLED") === "true";

    const internalHeaders = {
      "Content-Type": "application/json",
      "x-internal-secret": serviceKey,
    };

    let payoutResult: any = { stub: true };
    const railsAttempted: string[] = [];
    const railErrors: string[] = [];

    // Admin corridor board (preferred + optional failover) — takes priority over
    // hardcoded exclusive corridors when an enabled policy exists.
    const { policy: payoutPolicy, rails: policyRails } = await resolveCorridorRails(
      supabase,
      "payout",
      targetCurrency,
      recipientCountry || transfer.recipient_country,
      transfer.payout_method,
    );
    let policyRouted = false;

    // Routing engine (Phase 3): only takes over when an operator has switched the
    // active rule to live AND enabled live routing on this corridor. Otherwise the
    // existing hardcoded rails below run exactly as before.
    const routeRequest = {
      direction: "payout" as const,
      source_currency: transfer.source_currency,
      dest_currency: transfer.target_currency ?? transfer.source_currency,
      source_country: transfer.sender_country ?? "CA",
      dest_country: transfer.recipient_country ?? null,
      payment_method: transfer.payout_method ?? null,
      customer_type: "consumer",
      amount: Number(transfer.source_amount) || 0,
    };

    let engineRouted = false;
    // Zambia MoMo and ops force_rail skip the routing engine — Fincra-only for ZMW.
    // Admin / code-default payout rails also skip the scoring engine (explicit ops choice).
    if (!forceFincraOnly && !fincraExclusiveCorridor && !zambiaMomo && policyRails.length === 0) {

      try {
        const dispatch = await dispatchRoutedPayout(supabase, routeRequest, {
          transfer_id,
          transfer,
          requested_by: user.id,
          supabaseUrl: Deno.env.get("SUPABASE_URL")!,
          serviceKey,
          authHeader,
        });
        if (dispatch.routed) {
          engineRouted = true;
          payoutResult = dispatch.payoutResult;
          console.log("routed by engine", dispatch.partner_code, "attempts", dispatch.attempts);
        }
      } catch (e) {
        console.error("routing engine dispatch failed, using legacy rails", e);
      }
    }

    const flwBody = () => ({
      transfer_id,
      phone_number: transfer.recipient_phone,
      account_number: transfer.recipient_account,
      bank_code: transfer.recipient_bank_code,
      amount: Number(transfer.target_amount ?? transfer.source_amount),
      currency: transfer.target_currency ?? transfer.source_currency,
      network: resolveNetwork(transfer.payout_method, transfer.target_currency ?? transfer.source_currency),
      recipient_name: transfer.recipient_name,
    });

    const payoutOk = (r: any) =>
      r && r.stub !== true && r.success !== false && (r.success === true || r.queued || r.pending_liquidity);

    const holdPendingOps = async (errorMsg: string, attempted: string[]) => {
      const reason = String(errorMsg || "Payout failed").slice(0, 500);
      const explained = explainPayoutError(reason);
      const perRail = railErrors.length
        ? ` Providers: ${railErrors.join(" | ")}`
        : "";
      const humanNote = `${explained.plain} — ${explained.tip}${perRail}`.slice(0, 900);
      await supabase.from("transfers").update({
        status: "pending_ops",
        ops_status: "needs_manual_settlement",
        ops_note: humanNote,
        rails_attempted: attempted,
        failure_reason: (railErrors.join(" | ") || reason).slice(0, 500),
        ops_alerted_at: new Date().toISOString(),
      }).eq("id", transfer_id);
      const bankBits = [
        transfer.recipient_bank_name,
        transfer.recipient_bank_code ? `code ${transfer.recipient_bank_code}` : null,
        transfer.recipient_account,
      ].filter(Boolean).join(" · ");
      await notifyOpsBrief({
        subject: `[Action needed] ${transfer.source_amount} ${transfer.source_currency} payout on hold`,
        moneyStatus: "held",
        amount: `${transfer.source_amount} ${transfer.source_currency}`,
        recipient: String(transfer.recipient_name || ""),
        corridor: `${transfer.source_currency} → ${targetCurrency}`,
        country: recipientCountry || transfer.recipient_country || "",
        transferId: String(transfer_id),
        providersTried: attempted,
        policyPreferred: payoutPolicy?.preferred_partner,
        policyBackups: payoutPolicy?.failover_partners || [],
        rawError: (railErrors.join(" | ") || reason).slice(0, 500),
        accountHint: bankBits || undefined,
      });
      return {
        success: true,
        queued: true,
        pending_ops: true,
        message: "Your payment was received. We're finishing delivery to your recipient.",
        rail: attempted[attempted.length - 1],
        error: reason,
        rails_attempted: attempted,
      };
    };

    try {
      if (engineRouted) {
        // Routing engine already executed the payout.
      } else if (!forceFincraOnly && policyRails.length > 0) {
        // Admin corridor board: preferred first, then optional failover list only.
        policyRouted = true;
        for (const rail of policyRails) {
          if (payoutOk(payoutResult)) break;
          const fn = payoutFnForRail(rail);
          if (!fn) {
            railsAttempted.push(rail);
            payoutResult = { success: false, error: `No payout function for rail ${rail}`, rail };
            continue;
          }
          railsAttempted.push(rail);
          await supabase.from("transfers").update({
            provider_charge_id: `rail:${rail}`,
            provider_reference: rail === "fincra"
              ? `FINCRA-PENDING-${String(transfer_id).slice(0, 8)}`
              : null,
          }).eq("id", transfer_id);
          const body = rail === "fincra"
            ? { ...flwBody(), skip_reversal: true }
            : { ...flwBody(), transfer_id };
          const res = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fn}`,
            { method: "POST", headers: internalHeaders, body: JSON.stringify(body) },
          );
          const rJson = await res.json().catch(() => ({
            success: false,
            error: `${fn} HTTP ${res.status}`,
          }));
          payoutResult = { ...rJson, rail, priority_chain: [...railsAttempted] };
          if (!payoutOk(payoutResult)) {
            const err = String(rJson?.error || rJson?.message || `${fn} failed`);
            railErrors.push(`${rail}: ${err}`);
            await supabase.from("transfers").update({
              provider_charge_id: null,
              provider_reference: null,
            }).eq("id", transfer_id);
          }
        }
      } else if (forceFincraOnly || fincraExclusiveCorridor) {
        // Zambia MoMo (and ops force_rail): Fincra only — Nomba has no ZMW corridor.
        // Ledger reverses inside fincra-payout when skip_reversal is false.
        if (!fincraConfigured) {
          payoutResult = {
            success: false,
            error: "Fincra is not configured for this corridor",
            rail: "fincra",
            force_rail: forceFincraOnly ? "fincra_only" : "fincra_exclusive",
          };
        } else {
          await supabase.from("transfers").update({
            provider_reference: `FINCRA-PENDING-${String(transfer_id).slice(0, 8)}`,
            provider_charge_id: "rail:fincra",
          }).eq("id", transfer_id);
          const fincraRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/fincra-payout`,
            {
              method: "POST",
              headers: internalHeaders,
              body: JSON.stringify({
                ...flwBody(),
                skip_reversal: false,
              }),
            },
          );
          const json = await fincraRes.json().catch(() => ({
            success: false,
            error: `fincra-payout HTTP ${fincraRes.status}`,
          }));
          payoutResult = {
            ...json,
            rail: "fincra",
            force_rail: forceFincraOnly ? "fincra_only" : "fincra_exclusive",
          };
        }
      } else if (usePawapay) {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/pawapay-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
            },
            body: JSON.stringify({ transfer_id, recipient_country_hint: recipientCountryHint }),
          },
        );
        payoutResult = await res.json();
      } else if (useMtnMomo) {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/mtn-momo-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
            },
            body: JSON.stringify({ transfer_id }),
          },
        );
        payoutResult = await res.json();
      } else if (useStellar) {
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stellar-sep31-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: req.headers.get("Authorization") || "",
            },
            body: JSON.stringify({ transfer_id }),
          },
        );
        payoutResult = await res.json();
      } else if (transfer.payout_method === "card_push") {
        const fnBody: Record<string, unknown> = {
          transfer_id,
          card_token: payload.recipient_card_token,
          last4: payload.recipient_last4,
          brand: payload.recipient_brand,
          recipient_email: payload.recipient_email,
          recipient_kyc: payload.recipient_kyc,
          recipient_tos: payload.recipient_tos,
          client_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
            || req.headers.get("cf-connecting-ip")
            || "0.0.0.0",
        };
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-payout`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
            },
            body: JSON.stringify(fnBody),
          },
        );
        payoutResult = await res.json();
      } else if (isCanada) {
        const flovideReady = !!(
          Deno.env.get("FLOVIDE_PUBLIC_KEY")?.trim()
          && Deno.env.get("FLOVIDE_SECRET_KEY")?.trim()
        );
        const wantInterac = String(transfer.payout_method || "").toLowerCase().includes("interac");
        if (flovideReady && wantInterac) {
          const fvRes = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/flovide-payout`,
            {
              method: "POST",
              headers: internalHeaders,
              body: JSON.stringify({ transfer_id }),
            },
          );
          payoutResult = await fvRes.json().catch(() => ({
            success: false,
            error: `flovide-payout HTTP ${fvRes.status}`,
            rail: "flovide",
          }));
        }
        if (!payoutOk(payoutResult)) {
          const fnName = transfer.payout_method === "stripe_connect"
            ? "stripe-connect-instant-payout"
            : "paysafe-payout";
          const res = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/${fnName}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
              },
              body: JSON.stringify({ transfer_id }),
            },
          );
          payoutResult = await res.json();
        }
      } else if (fincraCapable) {
        // Fixed priority: Nomba (when configured) → Fincra → Flovide → Flutterwave → Paytota → Swychr
        const attempts: string[] = [];
        // Set when a rail returns a hard decline (bad recipient/number/limits) — never
        // re-attempt that on another provider.
        let hardDecline = false;
        const logAttempt = async (
          rail: string,
          attemptNumber: number,
          r: any,
          ok: boolean,
          latency: number,
        ) => {
          try {
            await supabase.from("routing_attempts").insert({
              transfer_id,
              partner_code: rail,
              function_slug: `${rail.replace(/_/g, "-")}-payout`,
              attempt_number: attemptNumber,
              outcome: ok ? "success" : "failed",
              retryable: !ok && r?.error_class !== "hard" && r?.retryable !== false,
              provider_reference: r?.reference ?? r?.provider_reference ?? null,
              error_message: ok ? null : String(r?.error || r?.provider_message || "").slice(0, 500),
              latency_ms: latency,
            });
          } catch (e) {
            console.error("routing_attempts insert failed", e);
          }
        };
        const tryNext = async (rail: string, fn: () => Promise<any>) => {
          if (payoutOk(payoutResult) || hardDecline) return;
          attempts.push(rail);
          const started = Date.now();
          const r = await fn();
          const ok = payoutOk(r);
          await logAttempt(rail, attempts.length, r, ok, Date.now() - started);
          if (ok) {
            payoutResult = { ...r, rail: r?.rail || rail, priority_chain: attempts };
          } else {
            // A hard decline is the recipient's fault, not the rail's — stop the chain.
            if (r?.error_class === "hard") hardDecline = true;
            const err = String(r?.error || r?.provider_message || `${rail} payout failed`);
            railErrors.push(`${rail}: ${err}`);
            payoutResult = {
              ...(r || {}),
              success: false,
              rail,
              error: err,
              priority_chain: attempts,
            };
          }
        };

        const flovideKeys = !!(
          Deno.env.get("FLOVIDE_PUBLIC_KEY")?.trim()
          && Deno.env.get("FLOVIDE_SECRET_KEY")?.trim()
        );

        // 0) Nomba — default for every corridor it supports (NGN bank + Global Payout MoMo/bank)
        if (nombaApiConfigured() && !zambiaMomo && targetCurrency !== "ZMW") {
          await tryNext("nomba", async () => {
            const nombaRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/nomba-payout`,
              { method: "POST", headers: internalHeaders, body: JSON.stringify({ transfer_id }) },
            );
            return nombaRes.json().catch(() => ({
              success: false,
              error: `nomba-payout HTTP ${nombaRes.status}`,
              rail: "nomba",
            }));
          });
        }

        // 1) Fincra
        if (!fincraConfigured) {
          console.error(
            "fincra rail skipped: FINCRA_SECRET_KEY/FINCRA_BUSINESS_ID not configured",
            { transfer_id, currency: targetCurrency, zambia: isZambia },
          );
          if (isZambia) {
            payoutResult = {
              success: false,
              rail: "fincra",
              error: "Zambia payout partner not configured (Fincra credentials missing).",
              code: "partner_not_configured",
            };
          }
        }
        if (fincraConfigured && Deno.env.get("FINCRA_PAYOUT_SMART") !== "false") {
          await tryNext("fincra", async () => {
            await supabase.from("transfers").update({
              provider_reference: `FINCRA-PENDING-${String(transfer_id).slice(0, 8)}`,
              provider_charge_id: "rail:fincra",
            }).eq("id", transfer_id);
            const fincraRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/fincra-payout`,
              {
                method: "POST",
                headers: internalHeaders,
                body: JSON.stringify({
                  ...flwBody(),
                  // Keep wallet funded so we can fall through to the next rail.
                  skip_reversal: true,
                }),
              },
            );
            return fincraRes.json().catch(() => ({
              success: false,
              error: `fincra-payout HTTP ${fincraRes.status}`,
              rail: "fincra",
            }));
          });
          if (!payoutOk(payoutResult)) {
            await supabase.from("transfers").update({
              provider_charge_id: null,
              provider_reference: null,
            }).eq("id", transfer_id);
          }
        }

        // 2) Flovide — NGN bank / GHS bank / KES-GHS-UGX MoMo when earlier rails miss
        if (
          flovideKeys
          && (isNigeriaBank || isGhanaBank || ["KES", "GHS", "UGX"].includes(targetCurrency))
        ) {
          await tryNext("flovide", async () => {
            const fvRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/flovide-payout`,
              {
                method: "POST",
                headers: internalHeaders,
                body: JSON.stringify({ ...flwBody(), transfer_id }),
              },
            );
            return fvRes.json().catch(() => ({
              success: false,
              error: `flovide-payout HTTP ${fvRes.status}`,
              rail: "flovide",
            }));
          });
        }

        // 3) Flutterwave — never for Zambia ZMW (Fincra-only corridor).
        if (!zambiaMomo && targetCurrency !== "ZMW") {
          await tryNext("flutterwave", async () => {
            const flwRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/flutterwave-payout`,
              { method: "POST", headers: internalHeaders, body: JSON.stringify(flwBody()) },
            );
            return flwRes.json().catch(() => ({
              success: false,
              error: `flutterwave-payout HTTP ${flwRes.status}`,
              rail: "flutterwave",
            }));
          });
        }

        // 4) Paytota (UGX/KES/RWF MoMo)
        if (paytotaCapable) {
          await tryNext("paytota", async () => {
            const paytotaRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/paytota-payout`,
              { method: "POST", headers: internalHeaders, body: JSON.stringify({ transfer_id }) },
            );
            return paytotaRes.json().catch(() => ({
              success: false,
              error: `paytota-payout HTTP ${paytotaRes.status}`,
              rail: "paytota",
            }));
          });
        }

        // 5) Swychr (NGN bank when enabled)
        if (isNigeriaBank && swychrEnabled) {
          await tryNext("swychr", async () => {
            const swychrRes = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/swychr-payout`,
              { method: "POST", headers: internalHeaders, body: JSON.stringify({ transfer_id }) },
            );
            return swychrRes.json().catch(() => ({
              success: false,
              error: `swychr-payout HTTP ${swychrRes.status}`,
              rail: "swychr",
            }));
          });
        }

        console.log("priority payout chain", attempts, "final", payoutResult?.rail, payoutResult?.success);
      } else if (isZambia) {
        // Zambia is a Fincra-only corridor.
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/fincra-payout`,
          {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify({ ...flwBody(), skip_reversal: false }),
          },
        );
        payoutResult = await res.json().catch(() => ({
          success: false,
          error: `fincra-payout HTTP ${res.status}`,
          rail: "fincra",
        }));
      } else {
        // Other corridors → Flutterwave default
        const res = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/flutterwave-payout`,
          {
            method: "POST",
            headers: internalHeaders,
            body: JSON.stringify(flwBody()),
          },
        );
        payoutResult = await res.json();
      }
    } catch (e) {
      console.error("Payout trigger error:", e);
      payoutResult = {
        success: false,
        error: e instanceof Error ? e.message : "Payout trigger failed",
        code: "payout_trigger_error",
      };
    }

    // If every rail failed, HOLD funds for ops (no auto-refund).
    // Admin refunds or retries from /admin/ops-queue.
    if (
      payoutResult
      && payoutResult.success === false
      && !payoutResult.pending_liquidity
      && !payoutResult.queued
      && !payoutResult.pending_ops
    ) {
      const attempted = Array.isArray(payoutResult.priority_chain) && payoutResult.priority_chain.length
        ? payoutResult.priority_chain as string[]
        : (railsAttempted.length ? railsAttempted : [String(payoutResult.rail || "unknown")]);
      // Exclusive Fincra path may already have reversed inside fincra-payout —
      // still surface as ops alert but mark failed if already refunded.
      if (payoutResult.refunded === true || forceFincraOnly) {
        await notifyOpsBrief({
          subject: `[FYI] ${transfer.source_amount} ${transfer.source_currency} payout failed — customer refunded`,
          moneyStatus: "refunded",
          amount: `${transfer.source_amount} ${transfer.source_currency}`,
          recipient: String(transfer.recipient_name || ""),
          corridor: `${transfer.source_currency} → ${targetCurrency}`,
          country: recipientCountry || transfer.recipient_country || "",
          transferId: String(transfer_id),
          providersTried: attempted,
          policyPreferred: payoutPolicy?.preferred_partner,
          policyBackups: payoutPolicy?.failover_partners || [],
          rawError: String(payoutResult.error || ""),
        });
        await supabase.from("transfers").update({
          status: "failed",
          failure_reason: String(payoutResult.error || "Payout failed").slice(0, 500),
        }).eq("id", transfer_id);
      } else {
        payoutResult = await holdPendingOps(
          String(payoutResult.error || payoutResult.provider_message || "Payout failed"),
          attempted,
        );
      }
    }

    // Shadow mode: record what the engine would have chosen for legacy-routed transfers.
    if (!engineRouted) {
      await observeRoute(supabase, routeRequest, {
        transfer_id,
        actual_partner_code: payoutResult?.rail ?? null,
        requested_by: user.id,
      });
    }

    // Phase 4: capture the unit economics of every payout that actually left.
    const payoutAccepted =
      payoutResult?.stub !== true &&
      payoutResult?.success !== false;
    if (payoutAccepted) {
      const { data: decisionRow } = await supabase
        .from("routing_decisions")
        .select("id")
        .eq("transfer_id", transfer_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      await recordEconomics(supabase, routeRequest, {
        transfer_id,
        partner_code: payoutResult?.rail ?? null,
        routing_decision_id: decisionRow?.id ?? null,
        source: engineRouted ? "routed" : "legacy",
        actual_customer_fee: Number(transfer.fee_amount ?? 0),
      });

      // Preferred rail failed but a backup paid — short FYI to ops (no action required).
      if (railErrors.length > 0 && payoutResult?.rail) {
        const firstFail = railErrors[0] || "";
        const colon = firstFail.indexOf(":");
        const failedRail = colon > 0 ? firstFail.slice(0, colon).trim() : "unknown";
        const failedWhy = colon > 0 ? firstFail.slice(colon + 1).trim() : firstFail;
        const explained = explainPayoutError(failedWhy);
        void notifyOpsFailoverPing({
          amount: `${transfer.source_amount} ${transfer.source_currency}`,
          recipient: String(transfer.recipient_name || ""),
          failedRail,
          failedWhy,
          workedRail: String(payoutResult.rail),
          tip: explained.tip,
          transferId: String(transfer_id),
        }).catch(() => null);
      }
    }


    // Never leave the client with a fake success when no payout rail ran — hold for ops.
    if (payoutResult?.stub === true && payoutResult?.success !== true) {
      const reason = "Payout provider did not accept this transfer. Please try again or use another rail.";
      payoutResult = await holdPendingOps(reason, railsAttempted.length ? railsAttempted : ["stub"]);
    }

    if (payoutResult?.pending_ops) {
      return new Response(JSON.stringify({
        success: true,
        queued: true,
        pending_ops: true,
        message: payoutResult.message || "Your payment was received. We're finishing delivery to your recipient.",
        payout: payoutResult,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payoutResult && payoutResult.success === false && !payoutResult.pending_liquidity && !payoutResult.queued) {
      return new Response(JSON.stringify({
        success: false,
        error: payoutResult.error || payoutResult.provider_message || "Payout failed",
        code: payoutResult.code,
        rail: payoutResult.rail || (isNigeriaBank ? "nomba" : undefined),
        provider_message: payoutResult.provider_message ?? null,
        nomba_raw: payoutResult.raw_response ?? payoutResult.nomba_raw ?? null,
        refunded: payoutResult.refunded,
        payout: payoutResult,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (payoutResult?.pending_liquidity || payoutResult?.queued) {
      return new Response(JSON.stringify({
        success: true,
        queued: true,
        pending_liquidity: true,
        message: "Your payment was received. We're completing delivery to your recipient.",
        payout: payoutResult,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, payout: payoutResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("execute-transfer error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
