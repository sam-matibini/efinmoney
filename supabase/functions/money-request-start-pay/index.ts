// Public: start pay-in for a money request (payer need not be logged in).
// Methods: interac (CAD) | bank_va (NGN/GHS) | checkout (Fincra hosted — USD/KES/ZMW/NGN/GHS).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  buildFincraInteracInstructions,
  resolveFincraCadAlias,
  FINCRA_INTERAC_OPEN_STATUSES,
} from "../_shared/fincraCad.ts";
import { fincraFetch, getFincraConfig, normalizeFincraRedirectUrl } from "../_shared/fincra.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PAYMENT_METHODS_BY_CCY: Record<string, string[]> = {
  NGN: ["card", "bank_transfer"],
  KES: ["mobile_money"],
  GHS: ["mobile_money", "card"],
  ZMW: ["mobile_money", "card"],
  USD: ["card"],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,16}$/.test(code)) return json({ error: "Invalid code" }, 400);

  const method = String(body?.method ?? "").trim().toLowerCase();
  const payerName = String(body?.payer_name ?? "").trim().slice(0, 120) || null;
  const payerEmailRaw = String(body?.payer_email ?? "").trim().toLowerCase();
  const payerEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmailRaw) ? payerEmailRaw : null;
  const payerBank = String(body?.payer_bank ?? "").trim().slice(0, 80) || null;
  const redirectUrl = String(body?.redirect_url || body?.redirectUrl || "").trim();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `money_req_pay:${ip}`,
    p_max_requests: 30,
    p_window_seconds: 60,
  });
  if (rl === false) return json({ error: "Too many requests, slow down" }, 429);

  const { data: reqRow, error: reqErr } = await admin
    .from("money_requests")
    .select(
      "id, amount, currency, status, expires_at, requester_id, requester_wallet_id, fincra_intent_id, note",
    )
    .eq("short_code", code)
    .maybeSingle();
  if (reqErr || !reqRow) return json({ error: "Link not found" }, 404);

  if (reqRow.status === "paid") return json({ error: "This request is already paid" }, 409);
  if (reqRow.status === "cancelled") return json({ error: "This request was cancelled" }, 409);
  if (reqRow.status === "failed") return json({ error: "This request failed" }, 409);

  if (new Date(reqRow.expires_at).getTime() < Date.now()) {
    await admin.from("money_requests").update({ status: "expired" }).eq("id", reqRow.id);
    return json({ error: "This request has expired" }, 410);
  }
  if (!["pending", "awaiting_payment"].includes(reqRow.status)) {
    return json({ error: `Cannot pay a ${reqRow.status} request` }, 409);
  }

  const currency = String(reqRow.currency).toUpperCase();
  const amount = Math.round(Number(reqRow.amount) * 100) / 100;

  // Infer method if omitted
  let payMethod = method;
  if (!payMethod) {
    if (currency === "CAD") payMethod = "interac";
    else if (currency === "NGN" || currency === "GHS") payMethod = "bank_va";
    else payMethod = "checkout";
  }

  // ── CAD Interac ──────────────────────────────────────────────────────────
  if (payMethod === "interac") {
    if (currency !== "CAD") return json({ error: "Interac is only for CAD requests" }, 400);

    if (reqRow.fincra_intent_id) {
      const { data: existing } = await admin
        .from("fincra_cad_interac_intents")
        .select("id, amount, reference, public_id, status, expires_at")
        .eq("id", reqRow.fincra_intent_id)
        .maybeSingle();
      if (
        existing
        && FINCRA_INTERAC_OPEN_STATUSES.includes(String(existing.status))
        && new Date(existing.expires_at || reqRow.expires_at).getTime() > Date.now()
      ) {
        const rail = await resolveFincraCadAlias();
        const alias = rail.alias || Deno.env.get("FINCRA_CAD_INTERAC_ALIAS") || "";
        const reference = String(existing.public_id || existing.reference);
        return json({
          ok: true,
          method: "interac",
          reused: true,
          alias,
          intent_id: existing.id,
          reference,
          amount: Number(existing.amount),
          currency: "CAD",
          instructions: buildFincraInteracInstructions(
            Number(existing.amount),
            alias,
            reference,
            payerEmail || "your Canadian bank",
            "money_request",
          ),
        });
      }
    }

    const rail = await resolveFincraCadAlias();
    const alias = rail.alias || Deno.env.get("FINCRA_CAD_INTERAC_ALIAS") || "";
    if (!alias) return json({ error: "Interac Autodeposit is not configured yet" }, 503);

    let reference = "";
    const { data: generated, error: refErr } = await admin.rpc("next_interac_public_id");
    if (!refErr && typeof generated === "string" && generated) {
      reference = generated;
    } else {
      const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      reference = `EFM-${day}-${String(Date.now() % 100000000).padStart(8, "0")}`;
    }

    const senderName = payerName || "Family or friend pay-in";
    const { data: intent, error: insErr } = await admin
      .from("fincra_cad_interac_intents")
      .insert({
        user_id: reqRow.requester_id,
        wallet_id: reqRow.requester_wallet_id,
        amount,
        currency_code: "CAD",
        reference,
        public_id: reference,
        status: "awaiting_payment",
        claimed_sent_at: new Date().toISOString(),
        sender_name: senderName,
        sender_email: payerEmail,
        sender_bank: payerBank,
        sender_country: "CA",
        purpose: "money_request",
        money_request_id: reqRow.id,
        customer_name: senderName,
        customer_email: payerEmail,
      })
      .select("id, amount, reference, public_id, status")
      .single();

    if (insErr || !intent) {
      return json({ error: insErr?.message || "Could not start Interac pay-in" }, 500);
    }

    await admin
      .from("money_requests")
      .update({
        status: "awaiting_payment",
        fincra_intent_id: intent.id,
        payer_name: payerName,
        payer_email: payerEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reqRow.id)
      .in("status", ["pending", "awaiting_payment"]);

    return json({
      ok: true,
      method: "interac",
      reused: false,
      alias,
      intent_id: intent.id,
      reference: String(intent.public_id || intent.reference),
      amount: Number(intent.amount),
      currency: "CAD",
      instructions: buildFincraInteracInstructions(
        Number(intent.amount),
        alias,
        String(intent.public_id || intent.reference),
        payerEmail || "your Canadian bank",
        "money_request",
      ),
    });
  }

  // ── NGN/GHS permanent bank VA ────────────────────────────────────────────
  if (payMethod === "bank_va") {
    if (currency !== "NGN" && currency !== "GHS") {
      return json({ error: "Bank transfer details are for NGN and GHS only" }, 400);
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", reqRow.requester_id)
      .maybeSingle();
    const { data: va } = await admin
      .from("virtual_accounts")
      .select("bank_name, account_number, account_name, currency_code, status")
      .eq("user_id", reqRow.requester_id)
      .eq("currency_code", currency)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!va?.account_number) {
      return json({
        error: "This user has no active bank account for this currency yet. Ask them to open one under Bank account, or pay with card/mobile money below.",
        fallback_method: "checkout",
      }, 404);
    }

    await admin
      .from("money_requests")
      .update({
        status: "awaiting_payment",
        payer_name: payerName,
        payer_email: payerEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reqRow.id)
      .in("status", ["pending", "awaiting_payment"]);

    return json({
      ok: true,
      method: "bank_va",
      amount,
      currency,
      bank_va: {
        bank_name: String(va.bank_name || "Bank"),
        account_number: String(va.account_number),
        account_name: String(va.account_name || profile?.full_name || "eFinMoney"),
        currency_code: currency,
      },
      instructions: [
        `Open your banking app and transfer exactly ${currency} ${amount.toFixed(2)}.`,
        `Bank: ${va.bank_name || "Bank"}`,
        `Account number: ${va.account_number}`,
        `Account name: ${va.account_name || profile?.full_name || "eFinMoney"}`,
        `Use the exact amount so we can match this request.`,
        `This page updates when the deposit credits their wallet.`,
      ],
    });
  }

  // ── Hosted checkout (Fincra card / MoMo / bank transfer) ─────────────────
  if (payMethod === "checkout") {
    if (!["NGN", "GHS", "KES", "ZMW", "USD"].includes(currency)) {
      return json({ error: `Hosted checkout is not available for ${currency}` }, 400);
    }
    if (!redirectUrl) {
      return json({ error: "redirect_url required for checkout" }, 400);
    }

    const cfg = getFincraConfig();
    if (!cfg.secretKey || !cfg.publicKey) {
      return json({ error: "Checkout is not configured yet" }, 503);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name, phone")
      .eq("user_id", reqRow.requester_id)
      .maybeSingle();

    const reference = `efm_mreq_${reqRow.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`;
    const customerEmail = payerEmail || profile?.email || `payer.${reqRow.id.slice(0, 8)}@efinsuite.com`;
    const customerName = payerName || profile?.full_name || "eFinMoney payer";
    const fincraRedirectUrl = normalizeFincraRedirectUrl(redirectUrl);

    const payload: Record<string, unknown> = {
      amount,
      currency,
      redirectUrl: fincraRedirectUrl,
      reference,
      feeBearer: "customer",
      settlementDestination: "wallet",
      customer: {
        name: customerName,
        email: customerEmail,
        ...(profile?.phone ? { phoneNumber: String(profile.phone) } : {}),
      },
      metadata: {
        user_id: reqRow.requester_id,
        wallet_id: reqRow.requester_wallet_id,
        type: "wallet_topup",
        purpose: "money_request",
        money_request_id: reqRow.id,
        currency,
        credit_currency: currency,
        credit_amount: amount,
        charge_currency: currency,
        charge_amount: amount,
      },
      paymentMethods: PAYMENT_METHODS_BY_CCY[currency] ?? ["card"],
    };

    const { ok, status, json: fjson } = await fincraFetch("/checkout/payments", {
      method: "POST",
      body: JSON.stringify(payload),
      withPublicKey: true,
    });

    if (!ok) {
      const msg = String(fjson?.message || fjson?.error || `Checkout failed (HTTP ${status})`);
      return json({ error: msg }, 502);
    }

    const data = fjson?.data as Record<string, unknown> | undefined;
    const paymentLink = String(data?.link || "");
    if (!paymentLink) return json({ error: "Checkout link was empty" }, 502);

    await admin
      .from("money_requests")
      .update({
        status: "awaiting_payment",
        payer_name: payerName,
        payer_email: payerEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reqRow.id)
      .in("status", ["pending", "awaiting_payment"]);

    return json({
      ok: true,
      method: "checkout",
      amount,
      currency,
      payment_link: paymentLink,
      reference: data?.reference ?? reference,
      instructions: [
        `You'll pay ${currency} ${amount.toFixed(2)} on a secure checkout page.`,
        `After payment succeeds, ${profile?.full_name || "their"} eFinMoney wallet is credited automatically.`,
      ],
    });
  }

  return json({ error: `Unknown pay method: ${payMethod}` }, 400);
});
