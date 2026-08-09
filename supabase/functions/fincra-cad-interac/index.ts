import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getWiseConfig, wiseFetch, resolveWiseProfileId } from "../_shared/wise.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const CA_PHONE_RE = /^\+?1?[2-9]\d{9}$/;

/** Statuses where the customer can still pay and the deposit can still be allocated. */
const OPEN_STATUSES = ["pending", "awaiting_payment"];

const INTENT_COLUMNS =
  "id, public_id, amount, currency_code, reference, status, created_at, expires_at, credited_at, claimed_sent_at, sender_name, sender_email, sender_bank, sender_phone, purpose, transfer_id, hosted_url, sender_account_type, sender_address_line1, sender_address_line2, sender_city, sender_region, sender_postal_code, sender_country";

/**
 * Best-effort hosted payment request on Wise. When the account exposes the
 * payment-request API we hand the payer a Wise-hosted page (closest match to a
 * card-style redirect checkout); otherwise we fall back to the e-Transfer push.
 */
async function hostedPaymentRequest(amount: number, reference: string): Promise<string | null> {
  try {
    if (!getWiseConfig().apiToken) return null;
    const profileId = await resolveWiseProfileId();
    const res = await wiseFetch(`/v2/profiles/${encodeURIComponent(profileId)}/payment-requests`, {
      method: "POST",
      body: JSON.stringify({
        amount: { value: Math.round(amount * 100) / 100, currency: "CAD" },
        description: reference,
        reference,
        selectedPaymentMethods: ["PISP", "CARD"],
      }),
    });
    if (!res.ok || !res.json || typeof res.json !== "object") return null;
    const row = res.json as Record<string, unknown>;
    const link = row.link ?? row.paymentLink ?? row.url ?? (row.links as Record<string, unknown> | undefined)?.pay;
    return typeof link === "string" && link.startsWith("http") ? link : null;
  } catch (e) {
    console.warn("fincra-cad-interac: hosted payment request unavailable", e instanceof Error ? e.message : e);
    return null;
  }
}


/**
 * Interac e-Transfer deposits land in the Wise CAD balance.
 * Prefer an Interac/e-Transfer receive option exposed by Wise, then the configured alias.
 */
async function aliasFromWise(): Promise<string | null> {
  try {
    if (!getWiseConfig().apiToken) return null;
    const profileId = await resolveWiseProfileId();
    const res = await wiseFetch(`/v1/profiles/${encodeURIComponent(profileId)}/account-details`);
    if (!res.ok || !Array.isArray(res.json)) return null;
    for (const row of res.json as Array<Record<string, unknown>>) {
      if (String(row.status).toUpperCase() !== "ACTIVE") continue;
      const currency = typeof row.currency === "string"
        ? row.currency
        : String((row.currency as Record<string, unknown> | undefined)?.code || "");
      if (currency.toUpperCase() !== "CAD") continue;
      const options = Array.isArray(row.receiveOptions) ? row.receiveOptions as Array<Record<string, unknown>> : [];
      for (const opt of options) {
        const label = `${opt.type ?? ""} ${opt.title ?? ""}`.toUpperCase();
        if (!label.includes("INTERAC") && !label.includes("EMAIL")) continue;
        const details = Array.isArray(opt.details) ? opt.details as Array<Record<string, unknown>> : [];
        for (const d of details) {
          const value = String(d.value ?? d.body ?? "");
          const email = value.match(EMAIL_RE)?.[0];
          if (email) return email;
        }
      }
    }
  } catch (e) {
    console.warn("fincra-cad-interac: Wise alias lookup failed", e instanceof Error ? e.message : e);
  }
  return null;
}

async function resolveInteracAlias(): Promise<string> {
  const fromWise = await aliasFromWise();
  if (fromWise) return fromWise;
  return (
    Deno.env.get("WISE_CAD_INTERAC_ALIAS")?.trim() ||
    Deno.env.get("FINCRA_CAD_INTERAC_ALIAS")?.trim() ||
    ""
  );
}

function buildInstructions(
  amount: number,
  alias: string,
  reference: string,
  contact: string,
  purpose: string,
): string[] {
  return [
    `Open your Canadian banking app and start an Interac e-Transfer.`,
    `Send exactly CAD ${amount.toFixed(2)} to ${alias}.`,
    `Put the reference ${reference} in the message field.`,
    `Send from ${contact} so we can match your deposit automatically.`,
    `Autodeposit is enabled — no security question needed.`,
    purpose === "transfer"
      ? `Your transfer is released automatically once the deposit arrives (usually within minutes).`
      : purpose === "merchant_collection"
      ? `The payment is confirmed automatically once the deposit arrives (usually within minutes).`
      : `Your CAD wallet credits when the transfer arrives (usually within minutes).`,
  ];
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
    const alias = await resolveInteracAlias();

    if (req.method === "GET") {
      const url = new URL(req.url);
      const intentId = url.searchParams.get("intent_id");
      if (intentId) {
        const { data, error } = await admin
          .from("fincra_cad_interac_intents")
          .select(INTENT_COLUMNS)
          .eq("id", intentId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Intent not found" }, 404);
        return json({
          intent: data,
          alias: alias || null,
          configured: Boolean(alias),
        });
      }

      const { data: pending } = await admin
        .from("fincra_cad_interac_intents")
        .select(INTENT_COLUMNS)
        .eq("user_id", user.id)
        .in("status", OPEN_STATUSES)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      return json({
        alias: alias || null,
        configured: Boolean(alias),
        pending: pending ?? [],
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      amount?: number;
      wallet_id?: string;
      intent_id?: string;
      sender_name?: string;
      sender_email?: string;
      sender_phone?: string;
      sender_bank?: string;
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

    const action = String(body.action || "create").toLowerCase();

    if (action === "cancel") {
      const intentId = String(body.intent_id || "");
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from("fincra_cad_interac_intents")
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

    // The customer says they have sent the e-Transfer. This is a claim only — never a payment.
    if (action === "claim_sent") {
      const intentId = String(body.intent_id || "");
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from("fincra_cad_interac_intents")
        .update({ status: "awaiting_payment", claimed_sent_at: new Date().toISOString() })
        .eq("id", intentId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .select(INTENT_COLUMNS)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (data) return json({ ok: true, intent: data });

      // Already claimed or further along — return the current row instead of failing
      const { data: current } = await admin
        .from("fincra_cad_interac_intents")
        .select(INTENT_COLUMNS)
        .eq("id", intentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!current) return json({ error: "Intent not found" }, 404);
      return json({ ok: true, intent: current });
    }

    if (!alias) {
      return json({
        error: "Interac details are being prepared. Please try again in a moment.",
        code: "alias_missing",
      }, 503);
    }

    const amount = Number(body.amount);
    const walletId = String(body.wallet_id || "");
    if (!Number.isFinite(amount) || amount < 1) {
      return json({ error: "Enter an amount of at least CAD 1.00" }, 400);
    }
    if (!walletId) return json({ error: "wallet_id required" }, 400);

    const senderName = String(body.sender_name || "").trim();
    const senderEmail = String(body.sender_email || "").trim().toLowerCase();
    const senderPhoneRaw = String(body.sender_phone || "").trim();
    const senderPhone = senderPhoneRaw.replace(/[^\d+]/g, "");
    const senderBank = String(body.sender_bank || "").trim();
    const purpose = String(body.purpose || "topup").toLowerCase();
    const transferId = String(body.transfer_id || "").trim();
    if (!["topup", "transfer", "merchant_collection"].includes(purpose)) {
      return json({ error: "purpose must be topup, transfer or merchant_collection" }, 400);
    }
    if (purpose === "transfer" && !/^[0-9a-f-]{36}$/i.test(transferId)) {
      return json({ error: "transfer_id required for transfer funding" }, 400);
    }
    if (senderName.length < 2 || senderName.length > 100) {
      return json({ error: "Enter the sender's full name (2-100 characters)" }, 400);
    }
    if (!senderEmail && !senderPhone) {
      return json({ error: "Enter the email or mobile number you use with Interac" }, 400);
    }
    if (senderEmail && (!EMAIL_RE.test(senderEmail) || senderEmail.length > 255)) {
      return json({ error: "Enter a valid sender email address" }, 400);
    }
    if (senderPhone && !CA_PHONE_RE.test(senderPhone)) {
      return json({ error: "Enter a valid Canadian mobile number" }, 400);
    }
    if (senderBank.length > 100) {
      return json({ error: "Sending bank must be 100 characters or less" }, 400);
    }

    const merchantId = String(body.merchant_id || "").trim();
    const customerName = String(body.customer_name || "").trim().slice(0, 100) || null;
    const customerEmail = String(body.customer_email || "").trim().toLowerCase().slice(0, 255) || null;
    const customerPhone = String(body.customer_phone || "").trim().slice(0, 30) || null;

    const accountType = String(body.sender_account_type || "personal").trim().toLowerCase();
    if (!["personal", "business"].includes(accountType)) {
      return json({ error: "Account type must be personal or business" }, 400);
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
        .select("id, sender_id")
        .eq("id", transferId)
        .maybeSingle();
      if (!tr || tr.sender_id !== user.id) return json({ error: "Transfer not found" }, 404);
    }

    const { data: wallet, error: wErr } = await admin
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", walletId)
      .maybeSingle();
    if (wErr || !wallet || wallet.user_id !== user.id) {
      return json({ error: "Wallet not found" }, 404);
    }
    if (String(wallet.currency_code).toUpperCase() !== "CAD") {
      return json({ error: "Interac e-Transfer only funds CAD wallets" }, 400);
    }

    // Expire stale open intents for this user
    await admin
      .from("fincra_cad_interac_intents")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .in("status", OPEN_STATUSES)
      .lt("expires_at", new Date().toISOString());

    // EFM-YYYYMMDD-00000000 reference, generated by the database sequence
    let reference = "";
    const { data: generated, error: refErr } = await admin.rpc("next_interac_public_id");
    if (!refErr && typeof generated === "string" && generated) {
      reference = generated;
    } else {
      console.warn("fincra-cad-interac: reference generator unavailable", refErr?.message);
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reference = `EFM-${day}-${String(Date.now() % 100000000).padStart(8, "0")}`;
    }

    // The payer pressed "Pay", so the intent is already awaiting the deposit.
    const hostedUrl = await hostedPaymentRequest(amount, reference);

    const { data: intent, error: insErr } = await admin
      .from("fincra_cad_interac_intents")
      .insert({
        user_id: user.id,
        wallet_id: walletId,
        amount: Math.round(amount * 100) / 100,
        currency_code: "CAD",
        reference,
        public_id: reference,
        status: "awaiting_payment",
        claimed_sent_at: new Date().toISOString(),
        hosted_url: hostedUrl,
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
      return json({ error: insErr?.message || "Could not create Interac intent" }, 500);
    }

    return json({
      ok: true,
      alias,
      hosted_url: hostedUrl,
      intent,
      instructions: buildInstructions(
        Number(intent.amount),
        alias,
        intent.reference,
        senderEmail || senderPhone,
        purpose,
      ),
    });
  } catch (err) {
    console.error("fincra-cad-interac error:", err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
});
