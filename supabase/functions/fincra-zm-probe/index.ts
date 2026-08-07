/**
 * One-shot probe: try Zambia MoMo number formats + AIRTEL/MTN against Fincra
 * (list operators, account resolve, optional tiny payout).
 *
 * POST { phone, networks?, amount?, do_payout?, probe_key }
 */
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function variants(raw: string): string[] {
  let d = raw.replace(/\D/g, "");
  // Already international 260… — don't prepend again
  if (d.startsWith("260260")) d = d.slice(3);
  if (d.startsWith("0") && !d.startsWith("260")) d = "260" + d.slice(1);
  if (!d.startsWith("260") && d.length === 9) d = "260" + d;
  if (d.startsWith("260260")) d = "260" + d.slice(6);
  const national = d.startsWith("260") ? d.slice(3) : d;
  const nationalNo0 = national.startsWith("0") ? national.slice(1) : national;
  const with0 = nationalNo0.startsWith("0") ? nationalNo0 : `0${nationalNo0}`;
  // Prefer Fincra-confirmed 260… ; skip garbage 0260… / 260260…
  const out = [d, with0].filter((v) => v && !v.startsWith("0260") && !v.startsWith("260260"));
  return [...new Set(out.filter(Boolean))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const expected = (Deno.env.get("ZAMBIA_FINCRA_TEST_TOKEN") || "efm-zm-fincra-7f3a9c").trim();
    if (String(body.probe_key || "") !== expected) {
      return json({ error: "Invalid probe_key" }, 403);
    }

    const cfg = getFincraConfig();
    if (!cfg.secretKey || !cfg.businessId) {
      return json({ error: "Fincra not configured" }, 503);
    }

    const phone = String(body.phone || "260770069550");
    const networks: string[] = Array.isArray(body.networks) && body.networks.length
      ? body.networks.map((n: string) => String(n).toUpperCase())
      : ["AIRTEL", "MTN", "ZAMTEL"];
    const amount = Math.max(1, Math.round(Number(body.amount) || 5));
    const doPayout = body.do_payout === true;
    const sourceCurrency = String(body.source_currency || "NGN").toUpperCase();

    const results: Record<string, unknown> = {
      mode: cfg.mode,
      phone_input: phone,
      variants: variants(phone),
      amount_zmw: amount,
      do_payout: doPayout,
    };

    // 1) List banks / MoMo operators for ZM
    for (const path of [
      "/core/banks?currency=ZMW",
      "/core/banks?country=ZM",
      "/core/banks?currency=ZMW&type=mobile_money",
    ]) {
      const r = await fincraFetch(path, { method: "GET" });
      results[`list:${path}`] = { ok: r.ok, status: r.status, json: r.json };
      if (r.ok) break;
    }

    // 2) Account resolve for each variant × network
    const resolveRows: unknown[] = [];
    for (const accountNumber of variants(phone)) {
      for (const mobileMoneyCode of networks) {
        const r = await fincraFetch("/core/accounts/resolve", {
          method: "POST",
          body: JSON.stringify({
            accountNumber: accountNumber.replace(/^\+/, ""),
            mobileMoneyCode,
            currency: "ZMW",
            type: "mobile_money",
          }),
        });
        resolveRows.push({
          accountNumber: accountNumber.replace(/^\+/, ""),
          mobileMoneyCode,
          ok: r.ok,
          status: r.status,
          message: r.json?.message || r.json?.error || null,
          data: r.json?.data ?? null,
        });
      }
    }
    results.resolve = resolveRows;

    // Pick best resolve success, else prefer 260… + AIRTEL then MTN
    const resolvedOk = resolveRows.find((row: any) => row.ok) as
      | { accountNumber: string; mobileMoneyCode: string }
      | undefined;

    // 3) Quote NGN → ZMW (or same-currency ZMW)
    const quoteBody = {
      sourceCurrency,
      destinationCurrency: "ZMW",
      amount: String(amount),
      action: "receive",
      transactionType: "disbursement",
      business: cfg.businessId,
      feeBearer: "business",
      paymentDestination: "mobile_money_wallet",
      beneficiaryType: "individual",
    };
    const quote = await fincraFetch("/quotes/generate", {
      method: "POST",
      body: JSON.stringify(quoteBody),
    });
    results.quote = { ok: quote.ok, status: quote.status, json: quote.json };

    if (!doPayout) {
      return json({
        ...results,
        hint: "Set do_payout:true to attempt a real tiny payout with the best-looking format",
        suggested: resolvedOk || { accountNumber: variants(phone)[0], mobileMoneyCode: "AIRTEL" },
      });
    }

    // 4) Real payout attempts — stop on first non-validation success/accept
    const attempts: unknown[] = [];
    const tryList: Array<{ accountNumber: string; mobileMoneyCode: string }> = [];
    if (resolvedOk) tryList.push(resolvedOk);
    for (const accountNumber of variants(phone).map((v) => v.replace(/^\+/, ""))) {
      for (const mobileMoneyCode of networks) {
        if (!tryList.some((t) => t.accountNumber === accountNumber && t.mobileMoneyCode === mobileMoneyCode)) {
          tryList.push({ accountNumber, mobileMoneyCode });
        }
      }
    }

    // Prefer intl MSISDN + AIRTEL/MTN first; each live attempt can debit ~amountToCharge NGN.
    const maxAttempts = Math.min(12, Math.max(1, Number(body.max_attempts) || 6));
    const prioritized = [
      ...tryList.filter((t) => t.accountNumber.startsWith("260") && t.mobileMoneyCode === "AIRTEL"),
      ...tryList.filter((t) => t.accountNumber.startsWith("260") && t.mobileMoneyCode === "MTN"),
      ...tryList.filter((t) => t.accountNumber.startsWith("0") && t.mobileMoneyCode === "AIRTEL"),
      ...tryList.filter((t) => t.accountNumber.startsWith("0") && t.mobileMoneyCode === "MTN"),
      ...tryList,
    ].filter((t, i, arr) =>
      arr.findIndex((x) => x.accountNumber === t.accountNumber && x.mobileMoneyCode === t.mobileMoneyCode) === i
    );

    // Payout amount must match quoted sourceAmount (NOT amountToCharge).
    let activeQuote = quote.ok ? (quote.json?.data as Record<string, unknown>) : null;
    const payoutAmountFromQuote = (d: Record<string, unknown> | null) => {
      if (!d) return amount;
      const src = Number(d.sourceAmount ?? d.quotedAmount ?? 0);
      return src > 0 ? src : Number(d.amountToCharge || amount);
    };

    const acceptedStatuses = new Set(["processing", "successful", "success", "pending"]);

    for (const t of prioritized.slice(0, maxAttempts)) {
      // Fresh quote each attempt (quotes expire quickly)
      if (sourceCurrency !== "ZMW") {
        const q2 = await fincraFetch("/quotes/generate", {
          method: "POST",
          body: JSON.stringify(quoteBody),
        });
        if (q2.ok) activeQuote = q2.json?.data as Record<string, unknown>;
      }

      const quoteRef = String(activeQuote?.reference || "");
      const sendAmount = payoutAmountFromQuote(activeQuote);
      const customerReference = crypto.randomUUID();
      const phoneE164 = t.accountNumber.startsWith("260")
        ? t.accountNumber
        : `260${t.accountNumber.replace(/^0/, "")}`;
      const payload: Record<string, unknown> = {
        business: cfg.businessId,
        sourceCurrency: activeQuote && sourceCurrency !== "ZMW" ? sourceCurrency : "ZMW",
        destinationCurrency: "ZMW",
        amount: activeQuote && sourceCurrency !== "ZMW"
          ? String(Math.round(sendAmount * 100) / 100)
          : String(amount),
        description: `eFinMoney ZM probe ${t.mobileMoneyCode}`,
        paymentDestination: "mobile_money_wallet",
        customerReference,
        beneficiary: {
          firstName: "Patrick",
          lastName: "Test",
          type: "individual",
          accountHolderName: "Patrick Test",
          accountNumber: t.accountNumber,
          phone: phoneE164,
          country: "ZM",
          mobileMoneyCode: t.mobileMoneyCode,
        },
      };
      if (activeQuote && sourceCurrency !== "ZMW" && quoteRef) {
        payload.quoteReference = quoteRef;
      }

      const r = await fincraFetch("/disbursements/payouts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = (r.json?.data ?? null) as Record<string, unknown> | null;
      const payoutStatus = String(data?.status || "").toLowerCase();
      const message = String(r.json?.error || r.json?.message || `HTTP ${r.status}`);

      // Pull detail — generic "contact support" often hides the real reason here.
      let detail: unknown = null;
      for (const path of [
        `/disbursements/payouts/customer-reference/${customerReference}`,
        data?.reference ? `/disbursements/payouts/reference/${data.reference}` : "",
      ].filter(Boolean)) {
        const d = await fincraFetch(path, { method: "GET" });
        if (d.ok) {
          detail = d.json?.data ?? d.json;
          break;
        }
      }

      const accepted = r.ok && acceptedStatuses.has(payoutStatus);
      attempts.push({
        ...t,
        http_ok: r.ok,
        accepted,
        status: r.status,
        payout_status: payoutStatus || null,
        message,
        data,
        detail,
        customerReference,
        sent_amount: payload.amount,
        quote_source_amount: activeQuote?.sourceAmount ?? null,
        quote_amount_to_charge: activeQuote?.amountToCharge ?? null,
      });

      if (accepted) break;
      // Hard stop on clear config/balance errors (don't burn more NGN)
      const lower = message.toLowerCase();
      const detailMsg = JSON.stringify(detail || {}).toLowerCase();
      if (
        lower.includes("insufficient") || detailMsg.includes("insufficient") ||
        lower.includes("not enough") || detailMsg.includes("not enough") ||
        lower.includes("balance") && lower.includes("low")
      ) {
        break;
      }
    }

    results.payout_attempts = attempts;
    results.note =
      "HTTP 200 + status failed means Fincra accepted the payload but the MoMo leg failed. Each attempt may debit ~amountToCharge NGN until refunded.";
    return json(results);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
