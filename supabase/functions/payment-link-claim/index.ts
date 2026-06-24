// Recipient claims a payment link: chooses Interac / Debit card (Visa Direct) / EFT
// and we hand off to the underlying payout rail. Releases escrow on success.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { getPendingClaimAccountId } from "../_shared/payment-link-ledger.ts";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

function getStripe(): Stripe | null {
  if (!STRIPE_SECRET_KEY) return null;
  return new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2024-11-20.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function json(body: unknown, status = 200) {
  return jsonResponse(body, status);
}

// Recipient card-payout (Visa Direct) corridors, keyed by the link's payout
// CURRENCY. Mirrors src/lib/stripeCorridors.ts (CLAIM_KYC_BY_CURRENCY) and the
// CORRIDOR allow-list in stripe-payout. EUR spans several countries, so the
// recipient supplies their country in the claim payload.
const CLAIM_CORRIDORS: Record<string, { countries: string[]; postal: RegExp; requiresState: boolean; statePattern?: RegExp; usesSsnLast4?: boolean }> = {
  CAD: { countries: ["CA"], postal: /^[A-Z]\d[A-Z]\d[A-Z]\d$/, requiresState: true, statePattern: /^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/ },
  USD: { countries: ["US"], postal: /^\d{5}(\d{4})?$/, requiresState: true, statePattern: /^[A-Z]{2}$/, usesSsnLast4: true },
  GBP: { countries: ["GB"], postal: /^[A-Z0-9 ]{4,10}$/, requiresState: false },
  EUR: { countries: ["DE","FR","IT","ES","NL","BE","PT","IE","AT"], postal: /^[A-Z0-9 -]{3,12}$/, requiresState: false },
};

const STRIPE_REQUIREMENT_LABELS: Record<string, string> = {
  "individual.address.line1": "Street address",
  "individual.address.city": "City",
  "individual.address.state": "Province/state",
  "individual.address.postal_code": "Postal code",
  "individual.address.country": "Country",
  "individual.dob.day": "Date of birth",
  "individual.dob.month": "Date of birth",
  "individual.dob.year": "Date of birth",
  "individual.first_name": "First name",
  "individual.last_name": "Last name",
  "individual.phone": "Phone number",
  "individual.email": "Email",
  "individual.ssn_last_4": "SSN (last 4 digits)",
  "individual.id_number": "Government ID",
  "external_account": "Debit card",
  "tos_acceptance.date": "Terms acceptance",
  "tos_acceptance.ip": "Terms acceptance",
};

function labelStripeRequirement(field: string): string {
  return STRIPE_REQUIREMENT_LABELS[field]
    ?? field.replace(/^individual\./, "").replace(/\./g, " ").replace(/_/g, " ");
}

function collectStripeRequirements(account: { requirements?: { currently_due?: string[]; past_due?: string[]; eventually_due?: string[] } }): string[] {
  const req = account.requirements;
  return [...new Set([
    ...(req?.currently_due ?? []),
    ...(req?.past_due ?? []),
    ...(req?.eventually_due ?? []),
  ])];
}

async function buildCardPushStripeError(
  err: { raw?: { message?: string; code?: string; param?: string }; message?: string; code?: string; param?: string },
  stripe: Stripe,
  accountId: string | null,
): Promise<{ error: string; details?: string; missing_fields?: string[]; stripe_code?: string }> {
  const raw = String(err?.raw?.message || err?.message || "").trim();
  const stripeCode = err?.raw?.code || err?.code || undefined;
  const param = err?.raw?.param || err?.param;

  let missing: string[] = [];
  if (accountId) {
    try {
      const fresh = await stripe.accounts.retrieve(accountId);
      missing = collectStripeRequirements(fresh).map(labelStripeRequirement);
      missing = [...new Set(missing)];
    } catch { /* best-effort */ }
  }

  const lower = raw.toLowerCase();
  let error = raw || "Card payout failed";

  if (lower.includes("card_declined") || (lower.includes("declined") && !lower.includes("requirements"))) {
    error = "This card was declined. Try a different debit card.";
  } else if (lower.includes("invalid_card_type") || lower.includes("not a debit") || lower.includes("ineligible")) {
    error = "This card can't receive instant payouts. Use a Visa Debit or Debit Mastercard.";
  } else if (missing.length > 0) {
    error = `Card payouts couldn't be enabled. Check: ${missing.join(", ")}.`;
  } else if (lower.includes("requirements")) {
    error = "Card payouts couldn't be enabled with the details provided.";
  }

  const detailsParts: string[] = [];
  if (raw && raw !== error) detailsParts.push(raw);
  if (param) detailsParts.push(`Field: ${labelStripeRequirement(String(param))}`);
  if (stripeCode) detailsParts.push(`Stripe code: ${stripeCode}`);

  return {
    error,
    ...(detailsParts.length ? { details: detailsParts.join(" · ") } : {}),
    ...(missing.length ? { missing_fields: missing } : {}),
    ...(stripeCode ? { stripe_code: stripeCode } : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const stripe = getStripe();

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const code: string = String(body?.code ?? "");
  let method: "interac" | "card_push" | "eft" = body?.method;
  const recipientName: string = String(body?.recipient_name ?? "").trim();
  const recipientEmailRaw: string = String(body?.recipient_email ?? "").trim();
  let payload: any = body?.payload ?? {};
  const usePreset: boolean = body?.use_preset === true || body?.method === "preset";

  if (!/^[A-Z0-9]{4,16}$/i.test(code)) return json({ error: "Invalid code" }, 400);
  if (recipientName.length < 2) return json({ error: "Recipient name required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `plink_claim:${ip}`,
    p_max_requests: 10,
    p_window_seconds: 60,
  });
  if (rl === false) return json({ error: "Too many attempts" }, 429);

  // Pre-load the row (read-only) so we can apply preset payout details when present.
  const { data: existing } = await admin
    .from("payment_link_payouts")
    .select("id,status,preset_method,preset_payload,currency")
    .eq("short_code", code)
    .maybeSingle();
  if (!existing) return json({ error: "Link not found" }, 404);
  if (existing.status !== "pending") return json({ error: "Link is not available to claim" }, 409);

  // If sender preloaded payout details, force-use them and override client-supplied method/payload.
  if (existing.preset_method && existing.preset_payload) {
    if (existing.preset_method === "eft") {
      method = "eft";
      payload = {
        institution_number: existing.preset_payload.institution_number,
        transit_number: existing.preset_payload.transit_number,
        account_number: existing.preset_payload.account_number,
      };
    } else if (existing.preset_method === "interac") {
      method = "interac";
    }
  }

  if (!["interac", "card_push", "eft"].includes(method)) return json({ error: "Invalid method" }, 400);

  // For Interac, fall back to preset email if claimant didn't supply one.
  const recipientEmail =
    method === "interac" && !recipientEmailRaw && existing.preset_method === "interac"
      ? String(existing.preset_payload?.email ?? "")
      : recipientEmailRaw;

  // Atomic claim: only flip if still pending
  const { data: claimed, error: claimErr } = await admin
    .from("payment_link_payouts")
    .update({
      status: "claimed",
      claimed_method: method,
      claimed_at: new Date().toISOString(),
      claimed_ip: ip,
      claimed_payload: {
        recipient_name: recipientName,
        recipient_email: recipientEmail || null,
        method,
        via_preset: !!existing.preset_method,
        ...(method === "eft"
          ? {
              institution_number: String(payload.institution_number ?? ""),
              transit_number: String(payload.transit_number ?? ""),
              account_last4: String(payload.account_number ?? "").slice(-4),
            }
          : method === "card_push"
            ? { card_last4: payload.card_last4, card_brand: payload.card_brand }
            : { email: recipientEmail }),
      },
    })
    .eq("short_code", code)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select()
    .single();

  if (claimErr || !claimed) return json({ error: "Link is not available to claim" }, 409);

  // Validate rail-specific fields
  if (method === "interac") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      await rollback(admin, claimed.id);
      return json({ error: "Valid email required for Interac" }, 400);
    }
  } else if (method === "eft") {
    if (!/^\d{3}$/.test(String(payload.institution_number ?? ""))
      || !/^\d{5}$/.test(String(payload.transit_number ?? ""))
      || String(payload.account_number ?? "").length < 4) {
      await rollback(admin, claimed.id);
      return json({ error: "Valid Canadian bank account required" }, 400);
    }
  } else if (method === "card_push") {
    if (!payload.card_token || typeof payload.card_token !== "string") {
      await rollback(admin, claimed.id);
      return json({ error: "Card token required" }, 400);
    }
    if (!stripe) {
      await rollback(admin, claimed.id);
      return json({ error: "Card payouts are not configured" }, 500);
    }
    const corridor = CLAIM_CORRIDORS[String(claimed.currency).toUpperCase()];
    if (!corridor) {
      await rollback(admin, claimed.id);
      return json({ error: `Card payouts are not available for ${claimed.currency} links` }, 400);
    }
    const k = payload?.kyc;
    // For single-country currencies the country is fixed; for EUR the recipient
    // selects it. Validate it is within the corridor's allowed countries.
    const claimCountry = String(k?.address?.country || corridor.countries[0] || "").toUpperCase();
    if (!corridor.countries.includes(claimCountry)) {
      await rollback(admin, claimed.id);
      return json({ error: "Please select a supported recipient country." }, 400);
    }
    const tosOk = payload?.tos?.accepted === true;
    const dobOk =
      k?.dob &&
      Number.isInteger(k.dob.day) && k.dob.day >= 1 && k.dob.day <= 31 &&
      Number.isInteger(k.dob.month) && k.dob.month >= 1 && k.dob.month <= 12 &&
      Number.isInteger(k.dob.year) && k.dob.year >= 1900 && k.dob.year <= new Date().getFullYear() - 18;
    const stateOk = !corridor.requiresState
      || (corridor.statePattern?.test(String(k?.address?.state || "").toUpperCase()) ?? false);
    const addrOk =
      k?.address &&
      typeof k.address.line1 === "string" && k.address.line1.trim().length >= 3 &&
      typeof k.address.city === "string" && k.address.city.trim().length >= 2 &&
      stateOk &&
      corridor.postal.test(String(k.address.postal_code || "").toUpperCase().replace(/\s+/g, ""));
    const phoneOk = typeof k?.phone === "string" && /^\+?\d[\d\s\-()]{7,16}$/.test(k.phone);
    const ssnOk = !corridor.usesSsnLast4 || /^\d{4}$/.test(String(k?.ssn_last_4 || ""));
    if (!tosOk || !dobOk || !addrOk || !phoneOk || !ssnOk) {
      await rollback(admin, claimed.id);
      return json({ error: "Identity verification fields are incomplete or invalid" }, 400);
    }
  }

  // === Interac / EFT: execute Paysafe payout BEFORE posting release ledger ===
  let paysafeResult: Record<string, unknown> | null = null;
  let paysafeTransferId: string | null = null;

  if (method === "interac" || method === "eft") {
    const recipientAccount = method === "eft"
      ? `${payload.institution_number}-${payload.transit_number}-${String(payload.account_number ?? "")}`
      : recipientEmail;

    const { data: payTransfer, error: tInsErr } = await admin
      .from("transfers")
      .insert({
        sender_id: claimed.sender_id,
        sender_wallet_id: claimed.sender_wallet_id,
        recipient_name: recipientName,
        recipient_account: recipientAccount,
        recipient_country: "CA",
        transfer_type: "domestic_canada",
        payout_method: method,
        funding_source: "wallet",
        source_currency: claimed.currency,
        target_currency: claimed.currency,
        source_amount: claimed.amount,
        target_amount: claimed.amount,
        exchange_rate: 1,
        fee_amount: 0,
        status: "initiated",
        provider_reference: `PLINK-${code}`,
      })
      .select()
      .single();

    if (tInsErr || !payTransfer) {
      await rollback(admin, claimed.id);
      return json({ error: "Could not create transfer record" }, 500);
    }
    paysafeTransferId = payTransfer.id;

    try {
      const psRes = await fetch(`${SUPABASE_URL}/functions/v1/paysafe-payout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": SERVICE_ROLE,
        },
        body: JSON.stringify({ transfer_id: payTransfer.id, skip_wallet_refund: true }),
      });
      paysafeResult = await psRes.json();
    } catch (err) {
      console.error("paysafe-payout invoke failed for payment link", code, err);
      await admin.from("transfers").update({
        status: "failed",
        failure_reason: "Payout provider unreachable",
      }).eq("id", payTransfer.id);
      await rollback(admin, claimed.id);
      return json({ error: "We couldn't reach our Canadian payments partner. Please try again shortly." }, 502);
    }

    if (!paysafeResult?.success) {
      await rollback(admin, claimed.id);
      const details = paysafeResult?.details as { error?: { code?: string; message?: string } } | null;
      const paysafeCode = details?.error?.code;
      let msg: string;
      if (paysafeCode === "PAYMENTHUB-1") {
        msg = method === "interac"
          ? "Interac e-Transfer isn't enabled on our Canadian payments account yet. Please try Bank (EFT) or debit card, or contact support."
          : "This bank transfer option isn't enabled on our Canadian payments account yet. Please try a different delivery method.";
      } else {
        msg = String(paysafeResult?.error || "Canadian payout failed")
          .replace(/Your money has been returned to your wallet\s*[—-]?\s*/gi, "")
          .replace(/returned to your wallet\.?\s*/gi, "")
          .trim();
      }
      return json({ error: msg }, 502);
    }
  }

  // === Card push: execute Stripe Visa Direct payout BEFORE posting release ledger ===
  let stripePayoutId: string | null = null;
  let cardPayoutCountry = "CA";
  if (method === "card_push") {
    let stripeAcctId: string | null = null;
    try {
      const k = payload.kyc;
      const corridor = CLAIM_CORRIDORS[String(claimed.currency).toUpperCase()]!;
      const acctCountry = String(k?.address?.country || corridor.countries[0]).toUpperCase();
      cardPayoutCountry = acctCountry;
      const payoutCurrency = String(claimed.currency).toLowerCase();
      const cleanPostal = String(k.address.postal_code).toUpperCase().replace(/\s+/g, "");
      const acct = await stripe!.accounts.create({
        type: "custom",
        country: acctCountry,
        business_type: "individual",
        capabilities: {
          transfers: { requested: true },
        },
        individual: {
          first_name: recipientName.split(/\s+/)[0] || "Recipient",
          last_name: recipientName.split(/\s+/).slice(1).join(" ") || recipientName,
          email: recipientEmail || undefined,
          phone: String(k.phone),
          dob: { day: k.dob.day, month: k.dob.month, year: k.dob.year },
          ...(corridor.usesSsnLast4 && k.ssn_last_4 ? { ssn_last_4: String(k.ssn_last_4) } : {}),
          address: {
            line1: String(k.address.line1),
            city: String(k.address.city),
            ...(k.address.state ? { state: String(k.address.state).toUpperCase() } : {}),
            postal_code: cleanPostal,
            country: acctCountry,
          },
        },
        business_profile: {
          mcc: "6012",
          product_description: "Personal payment received via eFinMoney payment link",
          url: "https://efin.money",
        },
        tos_acceptance: {
          date: Math.floor(Date.now() / 1000),
          ip,
        },
        metadata: { payment_link_code: code, sender_id: claimed.sender_id },
      });
      stripeAcctId = acct.id;

      const ext = await stripe!.accounts.createExternalAccount(acct.id, {
        external_account: payload.card_token,
        default_for_currency: true,
      } as any);

      // Wait briefly for the `transfers` capability to flip to active.
      let capActive = false;
      for (let i = 0; i < 6; i++) {
        const fresh = await stripe!.accounts.retrieve(acct.id);
        if ((fresh.capabilities as any)?.transfers === "active") { capActive = true; break; }
        await new Promise(r => setTimeout(r, 1000));
      }
      if (!capActive) {
        const fresh = await stripe!.accounts.retrieve(acct.id);
        const due = collectStripeRequirements(fresh);
        const missing = [...new Set(due.map(labelStripeRequirement))];
        console.error("Stripe transfers capability not active", acct.id, due);
        await rollback(admin, claimed.id);
        return json({
          error: missing.length
            ? `Card payouts could not be enabled. Check: ${missing.join(", ")}.`
            : "Card payouts could not be enabled for this card. Try a different debit card.",
          details: due.length
            ? `Stripe transfers capability stayed inactive. Raw fields: ${due.join(", ")}`
            : "Stripe transfers capability stayed inactive after verification.",
          ...(missing.length ? { missing_fields: missing } : {}),
        }, 400);
      }

      const payout = await stripe!.payouts.create(
        {
          amount: Math.round(Number(claimed.amount) * 100),
          currency: payoutCurrency,
          method: "instant",
          destination: (ext as any).id,
          metadata: { payment_link_code: code, sender_id: claimed.sender_id },
        },
        { stripeAccount: acct.id },
      );
      stripePayoutId = payout.id;
    } catch (err: any) {
      console.error("Stripe card-push failed for payment link", code, err?.message, err?.raw);
      await rollback(admin, claimed.id);
      const errBody = await buildCardPushStripeError(err, stripe!, stripeAcctId);
      return json(errBody, 502);
    }
  }


  // Find COA accounts for release journal: DR pending claim / CR settlement (1108)
  const pendingAccId = await getPendingClaimAccountId(admin, claimed.currency);
  const { data: settleAcc } = await admin
    .from("ledger_accounts").select("id")
    .eq("code", "1108").eq("currency_code", claimed.currency).maybeSingle();
  const { data: settleFallback } = await admin
    .from("ledger_accounts").select("id")
    .eq("code", "1108").limit(1).maybeSingle();

  const settleAccountId = settleAcc?.id ?? settleFallback?.id;
  if (!pendingAccId || !settleAccountId) {
    await rollback(admin, claimed.id);
    return json({ error: "Missing ledger accounts" }, 500);
  }

  const releaseJournalId = crypto.randomUUID();
  const { error: ledErr } = await admin.from("ledger_entries").insert([
    {
      journal_id: releaseJournalId,
      account_id: pendingAccId,
      wallet_id: null,
      currency_code: claimed.currency,
      debit_amount: claimed.amount,
      credit_amount: 0,
      description: `Payment Link release [${code}] via ${method}`,
      reference_type: "payment_link",
      reference_id: releaseJournalId,
      created_by: claimed.sender_id,
    },
    {
      journal_id: releaseJournalId,
      account_id: settleAccountId,
      wallet_id: null,
      currency_code: claimed.currency,
      debit_amount: 0,
      credit_amount: claimed.amount,
      description: `Payment Link release [${code}] via ${method}`,
      reference_type: "payment_link",
      reference_id: releaseJournalId,
      created_by: claimed.sender_id,
    },
  ]);
  if (ledErr) {
    await rollback(admin, claimed.id);
    return json({ error: `Ledger error: ${ledErr.message}` }, 500);
  }

  // Create a transfers row mirroring the disbursement so it shows in history
  let transfer: { id: string } | null = null;
  if (method === "interac" || method === "eft") {
    const { data: existingTransfer } = await admin
      .from("transfers")
      .select("id")
      .eq("id", paysafeTransferId!)
      .single();
    transfer = existingTransfer;
  } else {
    const { data: cardTransfer } = await admin
      .from("transfers")
      .insert({
        sender_id: claimed.sender_id,
        sender_wallet_id: claimed.sender_wallet_id,
        recipient_name: recipientName,
        recipient_account: method === "card_push"
          ? `card-${payload.card_last4 || "xxxx"}`
          : (recipientEmail || "card"),
        recipient_country: method === "card_push" ? cardPayoutCountry : "CA",
        transfer_type: method === "card_push" && cardPayoutCountry !== "CA" ? "card_push" : "domestic_canada",
        payout_method: method,
        funding_source: "wallet",
        source_currency: claimed.currency,
        target_currency: claimed.currency,
        source_amount: claimed.amount,
        target_amount: claimed.amount,
        exchange_rate: 1,
        fee_amount: 0,
        status: method === "card_push" ? "processing" : "completed",
        provider_reference: stripePayoutId || `PLINK-${code}`,
        stripe_payout_id: stripePayoutId,
      })
      .select()
      .single();
    transfer = cardTransfer;
  }

  await admin
    .from("payment_link_payouts")
    .update({
      release_journal_id: releaseJournalId,
      transfer_id: transfer?.id ?? null,
      claimed_payload: {
        ...(claimed.claimed_payload ?? {}),
        recipient_name: recipientName,
        recipient_email: recipientEmail || null,
        method,
        ...(method === "card_push" ? { stripe_payout_id: stripePayoutId } : {}),
        ...(method === "interac" || method === "eft"
          ? {
              paysafe_id: paysafeResult?.paysafe_id ?? null,
              paysafe_status: paysafeResult?.status ?? null,
            }
          : {}),
      },
    })
    .eq("id", claimed.id);

  return json({
    success: true,
    amount: claimed.amount,
    currency: claimed.currency,
    method,
    transfer_id: transfer?.id ?? null,
    stripe_payout_id: stripePayoutId,
    paysafe_id: paysafeResult?.paysafe_id ?? null,
    security: paysafeResult?.security ?? null,
  });
});

async function rollback(admin: any, id: string) {
  await admin
    .from("payment_link_payouts")
    .update({ status: "pending", claimed_method: null, claimed_at: null, claimed_payload: null, claimed_ip: null })
    .eq("id", id);
}
