/**
 * Fincra USD bank-receive pay-in (VA / ACH deposit).
 * Creates a referenced intent; collection webhooks match amount/reference and credit USD wallet.
 *
 * VA: FINCRA_USD_VIRTUAL_ACCOUNT_ID or live GET /profile/virtual-accounts/?currency=usd
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  FINCRA_USD_DONE_STATUSES,
  FINCRA_USD_OPEN_STATUSES,
  resolveFincraUsdVa,
  settleFincraUsdBankIntent,
} from "../_shared/fincraUsd.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTENT_TABLE = "fincra_usd_bank_intents";
const INTENT_COLUMNS =
  "id, public_id, amount, currency_code, reference, status, created_at, expires_at, credited_at, claimed_sent_at, provider_reference, purpose, transfer_id, customer_name, customer_email";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, service);
    const va = await resolveFincraUsdVa();
    const railMeta = {
      provider: "fincra" as const,
      configured: va.configured,
      virtual_account_id: va.virtualAccountId,
      account_name: va.accountName,
      account_number: va.accountNumber,
      routing_number: va.routingNumber,
      bank_name: va.bankName,
      status: va.status,
      source: va.source,
    };

    if (req.method === "GET") {
      const url = new URL(req.url);
      const intentId = url.searchParams.get("intent_id");
      if (intentId) {
        const { data, error } = await admin
          .from(INTENT_TABLE)
          .select(INTENT_COLUMNS)
          .eq("id", intentId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        return json({ intent: data, rail: railMeta });
      }
      const { data, error } = await admin
        .from(INTENT_TABLE)
        .select(INTENT_COLUMNS)
        .eq("user_id", user.id)
        .in("status", FINCRA_USD_OPEN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) return json({ error: error.message }, 500);
      return json({ intents: data || [], rail: railMeta });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "create").toLowerCase();

    if (action === "rail_meta") {
      return json({ rail: railMeta });
    }

    if (action === "cancel") {
      const intentId = String(body.intent_id || "").trim();
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from(INTENT_TABLE)
        .update({ status: "cancelled" })
        .eq("id", intentId)
        .eq("user_id", user.id)
        .in("status", FINCRA_USD_OPEN_STATUSES)
        .select(INTENT_COLUMNS)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ intent: data, rail: railMeta });
    }

    if (action === "claim_sent") {
      const intentId = String(body.intent_id || "").trim();
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from(INTENT_TABLE)
        .update({ status: "claimed_sent", claimed_sent_at: new Date().toISOString() })
        .eq("id", intentId)
        .eq("user_id", user.id)
        .in("status", ["pending", "awaiting_payment"])
        .select(INTENT_COLUMNS)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ intent: data, rail: railMeta });
    }

    if (action === "complete") {
      const intentId = String(body.intent_id || "").trim();
      const providerRef = String(body.bank_reference || body.provider_reference || "").trim();
      const amount = Number(body.amount);
      if (!intentId) return json({ error: "intent_id required" }, 400);
      if (!providerRef || providerRef.length < 4) {
        return json({ error: "bank_reference required (at least 4 characters)" }, 400);
      }
      const { data: intent, error } = await admin
        .from(INTENT_TABLE)
        .select(INTENT_COLUMNS)
        .eq("id", intentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error || !intent) return json({ error: "Intent not found" }, 404);
      if (FINCRA_USD_DONE_STATUSES.includes(intent.status)) {
        return json({ intent, rail: railMeta, already_settled: true });
      }
      if (Math.abs(Number(intent.amount) - amount) > 0.02) {
        return json({ error: "Amount must match the intent exactly" }, 400);
      }
      const settled = await settleFincraUsdBankIntent(
        admin,
        intent,
        providerRef,
        "user_bank_reference",
      );
      return json({ intent: settled, rail: railMeta });
    }

    // create
    if (!va.configured) {
      return json({
        error: va.status === "pending" || va.status === "requested"
          ? "USD bank receive is pending Fincra virtual-account approval"
          : "USD bank receive is not configured yet — request a Fincra USD virtual account first",
        rail: railMeta,
        code: "usd_va_not_ready",
      }, 503);
    }

    const walletId = String(body.wallet_id || "").trim();
    const amount = Math.round(Number(body.amount) * 100) / 100;
    if (!walletId || !(amount > 0)) {
      return json({ error: "wallet_id and positive amount required" }, 400);
    }

    const { data: wallet, error: wErr } = await admin
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", walletId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (wErr || !wallet) return json({ error: "Wallet not found" }, 404);
    if (String(wallet.currency_code).toUpperCase() !== "USD") {
      return json({ error: "USD bank receive is only available for USD wallets" }, 400);
    }

    // Expire old opens for this user/wallet
    await admin
      .from(INTENT_TABLE)
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("wallet_id", walletId)
      .in("status", FINCRA_USD_OPEN_STATUSES)
      .lt("expires_at", new Date().toISOString());

    let reference = "";
    const { data: generated } = await admin.rpc("next_usd_bank_public_id");
    if (typeof generated === "string" && generated.startsWith("EFMU-")) {
      reference = generated;
    } else {
      reference = `EFMU-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: intent, error: insErr } = await admin
      .from(INTENT_TABLE)
      .insert({
        user_id: user.id,
        wallet_id: walletId,
        amount,
        currency_code: "USD",
        reference,
        public_id: reference,
        status: "awaiting_payment",
        customer_name: profile?.full_name || null,
        customer_email: user.email || null,
        purpose: String(body.purpose || "topup"),
        transfer_id: body.transfer_id ? String(body.transfer_id) : null,
      })
      .select(INTENT_COLUMNS)
      .single();

    if (insErr || !intent) {
      return json({ error: insErr?.message || "Failed to create intent" }, 500);
    }

    return json({
      intent,
      rail: railMeta,
      instructions: {
        amount,
        currency: "USD",
        memo: reference,
        account_name: va.accountName,
        account_number: va.accountNumber,
        routing_number: va.routingNumber,
        bank_name: va.bankName,
        note: "Include the memo/reference exactly so we can match your deposit.",
      },
    });
  } catch (e) {
    console.error("fincra-usd-bank", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
