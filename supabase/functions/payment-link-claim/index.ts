// Recipient claims a payment link: chooses Interac / Debit card (Visa Direct) / EFT
// and we hand off to the underlying payout rail. Releases escrow on success.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import Stripe from "https://esm.sh/stripe@13.9.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2023-10-16",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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
    if (String(claimed.currency).toUpperCase() !== "CAD") {
      await rollback(admin, claimed.id);
      return json({ error: "Card payouts are only available for CAD links" }, 400);
    }
    const k = payload?.kyc;
    const tosOk = payload?.tos?.accepted === true;
    const dobOk =
      k?.dob &&
      Number.isInteger(k.dob.day) && k.dob.day >= 1 && k.dob.day <= 31 &&
      Number.isInteger(k.dob.month) && k.dob.month >= 1 && k.dob.month <= 12 &&
      Number.isInteger(k.dob.year) && k.dob.year >= 1900 && k.dob.year <= new Date().getFullYear() - 18;
    const addrOk =
      k?.address &&
      typeof k.address.line1 === "string" && k.address.line1.trim().length >= 3 &&
      typeof k.address.city === "string" && k.address.city.trim().length >= 2 &&
      /^(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)$/.test(String(k.address.state || "")) &&
      /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(String(k.address.postal_code || "").toUpperCase().replace(/\s+/g, ""));
    const phoneOk = typeof k?.phone === "string" && /^\+?\d[\d\s\-()]{7,16}$/.test(k.phone);
    if (!tosOk || !dobOk || !addrOk || !phoneOk) {
      await rollback(admin, claimed.id);
      return json({ error: "Identity verification fields are incomplete or invalid" }, 400);
    }
  }

  // === Card push: execute Stripe Visa Direct payout BEFORE posting release ledger ===
  let stripePayoutId: string | null = null;
  if (method === "card_push") {
    try {
      const k = payload.kyc;
      const cleanPostal = String(k.address.postal_code).toUpperCase().replace(/\s+/g, "");
      const acct = await stripe!.accounts.create({
        type: "custom",
        country: "CA",
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
          address: {
            line1: String(k.address.line1),
            city: String(k.address.city),
            state: String(k.address.state).toUpperCase(),
            postal_code: cleanPostal,
            country: "CA",
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
        const due = (fresh.requirements as any)?.currently_due || [];
        console.error("Stripe transfers capability not active", acct.id, due);
        await rollback(admin, claimed.id);
        return json({
          error: due.length
            ? `Card payouts could not be enabled. Missing: ${due.join(", ")}. Please try a different debit card.`
            : "Card payouts could not be enabled for this card. Please try a different Canadian debit card.",
        }, 400);
      }

      const payout = await stripe!.payouts.create(
        {
          amount: Math.round(Number(claimed.amount) * 100),
          currency: "cad",
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
      const raw = err?.raw?.message || err?.message || "";
      let msg = raw || "Card payout failed";
      const lower = raw.toLowerCase();
      if (lower.includes("card_declined") || lower.includes("declined")) {
        msg = "This card was declined. Please try a different Canadian debit card.";
      } else if (lower.includes("invalid_card_type") || lower.includes("not a debit") || lower.includes("ineligible")) {
        msg = "This card can't receive instant payouts. Please use a Canadian Visa Debit or Debit Mastercard.";
      } else if (lower.includes("requirements")) {
        msg = "Card payouts couldn't be enabled with the details provided. Please double-check your name, address and date of birth.";
      }
      return json({ error: msg }, 502);
    }
  }


  // Find COA accounts for release journal: DR 2199 / CR settlement (1108)
  const { data: pendingAcc } = await admin
    .from("ledger_accounts").select("id")
    .eq("code", "2199").eq("currency_code", claimed.currency).maybeSingle();

  const { data: settleAcc } = await admin
    .from("ledger_accounts").select("id")
    .eq("code", "1108").eq("currency_code", claimed.currency).maybeSingle();
  const { data: settleFallback } = await admin
    .from("ledger_accounts").select("id")
    .eq("code", "1108").limit(1).maybeSingle();

  const settleAccountId = settleAcc?.id ?? settleFallback?.id;
  if (!pendingAcc?.id || !settleAccountId) {
    await rollback(admin, claimed.id);
    return json({ error: "Missing ledger accounts" }, 500);
  }

  const releaseJournalId = crypto.randomUUID();
  const { error: ledErr } = await admin.from("ledger_entries").insert([
    {
      journal_id: releaseJournalId,
      account_id: pendingAcc.id,
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
  const { data: transfer } = await admin
    .from("transfers")
    .insert({
      sender_id: claimed.sender_id,
      sender_wallet_id: claimed.sender_wallet_id,
      recipient_name: recipientName,
      recipient_account: method === "eft"
        ? `${payload.institution_number}-${payload.transit_number}-${String(payload.account_number).slice(-4)}`
        : method === "card_push"
          ? `card-${payload.card_last4 || "xxxx"}`
          : (recipientEmail || "card"),
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
      status: method === "card_push" ? "processing" : "completed",
      provider_reference: stripePayoutId || `PLINK-${code}`,
    })
    .select()
    .single();

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
  });
});

async function rollback(admin: any, id: string) {
  await admin
    .from("payment_link_payouts")
    .update({ status: "pending", claimed_method: null, claimed_at: null, claimed_payload: null, claimed_ip: null })
    .eq("id", id);
}
