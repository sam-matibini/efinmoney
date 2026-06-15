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
  const method: "interac" | "card_push" | "eft" = body?.method;
  const recipientName: string = String(body?.recipient_name ?? "").trim();
  const recipientEmail: string = String(body?.recipient_email ?? "").trim();
  const payload: any = body?.payload ?? {};

  if (!/^[A-Z0-9]{4,16}$/i.test(code)) return json({ error: "Invalid code" }, 400);
  if (!["interac", "card_push", "eft"].includes(method)) return json({ error: "Invalid method" }, 400);
  if (recipientName.length < 2) return json({ error: "Recipient name required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `plink_claim:${ip}`,
    p_max_requests: 10,
    p_window_seconds: 60,
  });
  if (rl === false) return json({ error: "Too many attempts" }, 429);

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
  }

  // === Card push: execute Stripe Visa Direct payout BEFORE posting release ledger ===
  let stripePayoutId: string | null = null;
  if (method === "card_push") {
    try {
      const acct = await stripe!.accounts.create({
        type: "custom",
        country: "CA",
        business_type: "individual",
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        individual: {
          first_name: recipientName.split(/\s+/)[0] || "Recipient",
          last_name: recipientName.split(/\s+/).slice(1).join(" ") || recipientName,
          email: recipientEmail || undefined,
        },
        metadata: { payment_link_code: code, sender_id: claimed.sender_id },
      });
      const ext = await stripe!.accounts.createExternalAccount(acct.id, {
        external_account: payload.card_token,
        default_for_currency: true,
      } as any);
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
      const msg = err?.raw?.message || err?.message || "Card payout failed";
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
