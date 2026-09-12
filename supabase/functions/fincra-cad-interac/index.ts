/**
 * Fincra CAD Interac e-Transfer pay-in.
 * Creates a referenced intent; collection.successful webhooks match amount/reference
 * and credit the user's CAD wallet.
 *
 * Alias: FINCRA_CAD_INTERAC_ALIAS secret, or live GET /profile/virtual-accounts/?currency=cad
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildFincraInteracInstructions,
  FINCRA_INTERAC_DONE_STATUSES,
  FINCRA_INTERAC_OPEN_STATUSES,
  resolveFincraCadAlias,
  settleFincraCadInteracIntent,
} from "../_shared/fincraCad.ts";
import {
  CAD_INTERAC_TRANSFER_SELECT,
  requireCadInteracDestination,
} from "../_shared/cadInteracPayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOG = "fincra-cad-interac";

function fail(branch: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  console.warn(`${LOG}: rejected [${branch}] ${status} ${message}`, JSON.stringify(extra));
  return json({ error: message, branch }, status);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const CA_PHONE_RE = /^\+?1?[2-9]\d{9}$/;
const OPEN_STATUSES = ["pending", "awaiting_payment"];
const INTENT_TABLE = "fincra_cad_interac_intents";

const INTENT_COLUMNS =
  "id, public_id, amount, currency_code, reference, status, created_at, expires_at, credited_at, claimed_sent_at, sender_name, sender_email, sender_bank, sender_phone, purpose, transfer_id, hosted_url, provider_reference, sender_account_type, sender_address_line1, sender_address_line2, sender_city, sender_region, sender_postal_code, sender_country";

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
    const cad = await resolveFincraCadAlias();
    const alias = cad.alias;
    const railMeta = {
      provider: "fincra" as const,
      alias: alias || null,
      configured: Boolean(alias),
      virtual_account_id: cad.virtualAccountId,
      alias_source: cad.source,
      eft: null,
      eft_configured: false,
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
        if (!data) return json({ error: "Intent not found" }, 404);
        return json({ intent: data, ...railMeta });
      }

      const { data: pending } = await admin
        .from(INTENT_TABLE)
        .select(INTENT_COLUMNS)
        .eq("user_id", user.id)
        .in("status", OPEN_STATUSES)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      return json({
        pending: pending ?? [],
        ...railMeta,
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const postUrl = new URL(req.url);
    const body = await req.json().catch(() => ({})) as {
      action?: string;
      amount?: number;
      wallet_id?: string;
      intent_id?: string;
      sender_name?: string;
      sender_email?: string;
      sender_phone?: string;
      sender_bank?: string;
      interac_reference?: string;
      provider_reference?: string;
      amount_transferred?: number;
      qty?: number;
      purpose?: string;
      transfer_id?: string;
      merchant_id?: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      sender_account_type?: string;
      sender_address_line1?: string;
      sender_address_line2?: string;
      sender_city?: string;
      sender_region?: string;
      sender_postal_code?: string;
      sender_country?: string;
    };

    const interacRefHint = String(body.interac_reference || body.provider_reference || "").trim();
    const intentHint = String(body.intent_id || "").trim();
    const action = String(
      postUrl.searchParams.get("action")
      || body.action
      || (interacRefHint && intentHint ? "complete" : "")
      || "create",
    ).toLowerCase();

    if (action === "cancel") {
      const intentId = String(body.intent_id || "");
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from(INTENT_TABLE)
        .update({ status: "cancelled" })
        .eq("id", intentId)
        .eq("user_id", user.id)
        .in("status", OPEN_STATUSES)
        .select("id, status")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Intent not found or not payable" }, 404);
      return json({ ok: true, intent: data });
    }

    if (action === "claim_sent") {
      const intentId = String(body.intent_id || "");
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from(INTENT_TABLE)
        .update({ status: "awaiting_payment", claimed_sent_at: new Date().toISOString() })
        .eq("id", intentId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .select(INTENT_COLUMNS)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (data) return json({ ok: true, intent: data });

      const { data: current } = await admin
        .from(INTENT_TABLE)
        .select(INTENT_COLUMNS)
        .eq("id", intentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!current) return json({ error: "Intent not found" }, 404);
      return json({ ok: true, intent: current });
    }

    if (action === "complete") {
      const intentId = String(body.intent_id || "");
      const interacRef = String(body.interac_reference || body.provider_reference || "").trim();
      if (!intentId) return fail("intent_id", "intent_id required", 400);
      if (!/^[A-Za-z0-9][A-Za-z0-9-]{3,31}$/.test(interacRef)) {
        return fail(
          "interac_reference",
          "Enter the Interac reference from your bank confirmation (for example CAh9ECkx).",
          400,
          { interacRef },
        );
      }

      const { data: current, error: lookupErr } = await admin
        .from(INTENT_TABLE)
        .select(`${INTENT_COLUMNS}, user_id, wallet_id`)
        .eq("id", intentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (lookupErr) return json({ error: lookupErr.message }, 500);
      if (!current) return fail("intent_lookup", "Intent not found", 404, { intentId });

      if (FINCRA_INTERAC_DONE_STATUSES.includes(String(current.status))) {
        return json({ ok: true, intent: current, already: true });
      }
      if (!FINCRA_INTERAC_OPEN_STATUSES.includes(String(current.status))) {
        return fail("intent_status", "This Interac request is no longer open.", 409, { status: current.status });
      }

      const expectedCents = Math.round(Number(current.amount) * 100);
      const transferredCents = Math.round(Number(body.amount_transferred) * 100);
      if (!Number.isFinite(transferredCents) || transferredCents !== expectedCents) {
        return fail(
          "amount_transferred",
          `Amount transferred must match the checkout amount (CAD ${Number(current.amount).toFixed(2)}).`,
          400,
          { expected: current.amount, amount_transferred: body.amount_transferred },
        );
      }
      const qty = Number(body.qty);
      if (!Number.isFinite(qty) || qty !== 1) {
        return fail("qty", "Quantity must be 1 (one order).", 400, { qty: body.qty });
      }

      try {
        const settled = await settleFincraCadInteracIntent(
          admin,
          {
            id: current.id,
            user_id: current.user_id,
            wallet_id: current.wallet_id,
            amount: Number(current.amount),
            reference: current.reference,
            public_id: current.public_id,
            status: current.status,
            purpose: current.purpose,
            transfer_id: current.transfer_id,
            provider_reference: current.provider_reference,
          },
          interacRef,
          "user_interac_reference",
        );
        const { data: fresh } = await admin
          .from(INTENT_TABLE)
          .select(INTENT_COLUMNS)
          .eq("id", settled.id)
          .maybeSingle();
        return json({ ok: true, intent: fresh ?? { ...current, ...settled, status: "settled", provider_reference: interacRef } });
      } catch (settleErr) {
        return fail(
          "complete",
          settleErr instanceof Error ? settleErr.message : "Could not complete this Interac payment",
          500,
        );
      }
    }

    if (!alias) {
      return fail(
        "alias_missing",
        "Fincra CAD Interac is not ready yet. Ask ops to confirm the @fincra.ca alias in the Merchant Portal (or set FINCRA_CAD_INTERAC_ALIAS).",
        503,
        { source: cad.source },
      );
    }

    // Complete must never fall through into create (which asks for a new amount).
    if (intentHint && interacRefHint) {
      return fail(
        "complete_required",
        "Use Complete with the Interac reference from your bank confirmation. Do not start a new collection.",
        400,
      );
    }

    const amount = Number(body.amount);
    const walletId = String(body.wallet_id || "");
    if (!Number.isFinite(amount) || amount < 1) {
      return fail("amount", "Enter an amount of at least CAD 1.00", 400, { amount: body.amount });
    }
    if (!walletId) return fail("wallet_id", "wallet_id required", 400);

    const senderName = String(body.sender_name || "").trim();
    const senderEmail = String(body.sender_email || "").trim().toLowerCase();
    const senderPhoneRaw = String(body.sender_phone || "").trim();
    const senderPhone = senderPhoneRaw.replace(/[^\d+]/g, "");
    const senderBank = String(body.sender_bank || "").trim();
    const purpose = String(body.purpose || "topup").toLowerCase();
    const transferId = String(body.transfer_id || "").trim();
    if (!["topup", "transfer", "merchant_collection"].includes(purpose)) {
      return fail("purpose", "purpose must be topup, transfer or merchant_collection", 400, { purpose });
    }
    if (purpose === "transfer" && !/^[0-9a-f-]{36}$/i.test(transferId)) {
      return fail("transfer_id", "transfer_id required for transfer funding", 400, { transferId });
    }
    if (senderName.length < 2 || senderName.length > 100) {
      return fail("sender_name", "Enter the sender's full name (2-100 characters)", 400, { length: senderName.length });
    }
    if (!senderEmail && !senderPhone) {
      return fail("sender_contact", "Enter the email or mobile number you use with Interac", 400);
    }
    if (senderEmail && (!EMAIL_RE.test(senderEmail) || senderEmail.length > 255)) {
      return fail("sender_email", "Enter a valid sender email address", 400);
    }
    if (senderPhone && !CA_PHONE_RE.test(senderPhone)) {
      return fail("sender_phone", "Enter a valid Canadian mobile number", 400, { normalized: senderPhone });
    }
    if (senderBank.length > 100) {
      return fail("sender_bank", "Sending bank must be 100 characters or less", 400);
    }

    const merchantId = String(body.merchant_id || "").trim();
    const customerName = String(body.customer_name || "").trim().slice(0, 100) || null;
    const customerEmail = String(body.customer_email || "").trim().toLowerCase().slice(0, 255) || null;
    const customerPhone = String(body.customer_phone || "").trim().slice(0, 30) || null;

    const accountType = String(body.sender_account_type || "personal").trim().toLowerCase();
    if (!["personal", "business"].includes(accountType)) {
      return fail("account_type", "Account type must be personal or business", 400, { accountType });
    }
    const trim = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max) || null;
    const addressLine1 = trim(body.sender_address_line1, 200);
    const addressLine2 = trim(body.sender_address_line2, 200);
    const city = trim(body.sender_city, 100);
    const region = trim(body.sender_region, 100);
    const postalCode = trim(body.sender_postal_code, 20);
    const country = (trim(body.sender_country, 2) || "CA").toUpperCase();

    if (purpose === "transfer") {
      const { data: tr } = await admin
        .from("transfers")
        .select(CAD_INTERAC_TRANSFER_SELECT)
        .eq("id", transferId)
        .maybeSingle();
      if (!tr || tr.sender_id !== user.id) return fail("transfer_lookup", "Transfer not found", 404, { transferId });
      const gate = requireCadInteracDestination(tr);
      if (gate.required && !gate.ok) {
        return fail("recipient_contact", gate.error, 400, { transferId, code: "missing_interac_contact" });
      }
    }

    const { data: wallet, error: wErr } = await admin
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", walletId)
      .maybeSingle();
    if (wErr || !wallet || wallet.user_id !== user.id) {
      return fail("wallet_lookup", "Wallet not found", 404, { walletId, dbError: wErr?.message });
    }
    if (String(wallet.currency_code).toUpperCase() !== "CAD") {
      return fail("wallet_currency", "Interac e-Transfer only funds CAD wallets", 400, { currency: wallet.currency_code });
    }

    await admin
      .from(INTENT_TABLE)
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .in("status", OPEN_STATUSES)
      .lt("expires_at", new Date().toISOString());

    let reference = "";
    const { data: generated, error: refErr } = await admin.rpc("next_interac_public_id");
    if (!refErr && typeof generated === "string" && generated) {
      reference = generated;
    } else {
      console.warn(`${LOG}: reference generator unavailable`, refErr?.message);
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reference = `EFM-${day}-${String(Date.now() % 100000000).padStart(8, "0")}`;
    }

    const { data: intent, error: insErr } = await admin
      .from(INTENT_TABLE)
      .insert({
        user_id: user.id,
        wallet_id: walletId,
        amount: Math.round(amount * 100) / 100,
        currency_code: "CAD",
        reference,
        public_id: reference,
        status: "awaiting_payment",
        claimed_sent_at: new Date().toISOString(),
        hosted_url: null,
        sender_name: senderName,
        sender_email: senderEmail || null,
        sender_phone: senderPhone || null,
        sender_bank: senderBank || null,
        sender_account_type: accountType,
        sender_address_line1: addressLine1,
        sender_address_line2: addressLine2,
        sender_city: city,
        sender_region: region,
        sender_postal_code: postalCode,
        sender_country: country,
        purpose,
        transfer_id: purpose === "transfer" ? transferId : null,
        merchant_id: /^[0-9a-f-]{36}$/i.test(merchantId) ? merchantId : null,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      })
      .select(INTENT_COLUMNS)
      .single();

    if (insErr || !intent) {
      return fail("insert", insErr?.message || "Could not create Interac intent", 500, {
        code: insErr?.code,
        details: insErr?.details,
      });
    }

    return json({
      ok: true,
      ...railMeta,
      hosted_url: null,
      intent,
      instructions: buildFincraInteracInstructions(
        Number(intent.amount),
        alias,
        intent.reference,
        senderEmail || senderPhone,
        purpose,
      ),
    });
  } catch (err) {
    console.error(`${LOG} error:`, err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
});
