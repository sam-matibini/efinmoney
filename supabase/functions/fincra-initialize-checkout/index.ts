import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fincraFetch, getFincraConfig, normalizeFincraRedirectUrl } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAYMENT_METHODS_BY_CCY: Record<string, string[]> = {
  // Confirmed on live merchant — payattitude rejected for this account ("not available for NGN")
  NGN: ["card", "bank_transfer"],
  KES: ["mobile_money"],
  GHS: ["mobile_money", "card"],
  UGX: ["mobile_money"],
  TZS: ["mobile_money"],
  ZMW: ["mobile_money", "card"],
  ZAR: ["card"],
  XAF: ["mobile_money"],
  XOF: ["mobile_money"],
  MWK: ["mobile_money"],
  USD: ["card"],
  // EUR/GBP not enabled for collect on this merchant yet — keep for when unlocked
  EUR: ["card", "bank_transfer"],
  GBP: ["card", "bank_transfer"],
};

/** Currencies Fincra checkout accepts for the charge itself (not wallet credit currency). */
const FINCRA_CHARGE_CURRENCIES = new Set([
  "NGN", "USD", "GBP", "EUR", "GHS", "KES", "UGX", "TZS", "ZMW",
  "EGP", "MZN", "MWK", "ZWL", "GNF", "XOF", "XAF", "ZAR",
]);

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function resolveCustomerName(
  profile: { full_name?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null } | null,
  user: { email?: string | null; user_metadata?: Record<string, unknown> },
): string {
  const candidates: string[] = [];
  if (profile?.full_name?.trim()) candidates.push(profile.full_name.trim());
  const parts = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();
  if (parts) candidates.push(parts);
  const meta = user.user_metadata ?? {};
  for (const key of ["full_name", "name", "display_name"]) {
    const v = String(meta[key] ?? "").trim();
    if (v) candidates.push(v);
  }
  for (const c of candidates) {
    if (c.includes("@")) continue;
    if (c.split(/\s+/).filter(Boolean).length >= 2) return c;
    if (c.length >= 2) return `${c} User`;
  }
  const email = profile?.email || user.email || "";
  const local = email.split("@")[0]?.replace(/[._+-]+/g, " ").trim();
  if (local && local.length >= 2) {
    const titled = local.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    return `${titled} User`;
  }
  return "eFinMoney User";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const walletId = body?.walletId ? String(body.walletId) : "";
    const clientRef = body?.reference ? String(body.reference) : "";
    const redirectUrl = String(body?.redirectUrl || "");

    // Charge currency sent to Fincra (USD for CAD-via-USD)
    let chargeCurrency = String(body?.currency || body?.charge_currency || "NGN").toUpperCase();
    let chargeAmount = Number(body?.amount ?? body?.charge_amount);

    // Wallet credit (may differ from charge — e.g. credit CAD, charge USD)
    let creditCurrency = String(body?.credit_currency || chargeCurrency).toUpperCase();
    let creditAmount = Number(body?.credit_amount ?? chargeAmount);

    // CAD wallet → always charge USD on Fincra (checkout API does not accept CAD)
    if (creditCurrency === "CAD" || chargeCurrency === "CAD") {
      creditCurrency = "CAD";
      chargeCurrency = "USD";
      if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        creditAmount = Number(body?.amount);
      }
      chargeAmount = Number(body?.charge_amount ?? body?.amount);
      if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) {
        return jr(400, { error: "CAD top-up requires charge_amount in USD" });
      }
    }

    if (!Number.isFinite(chargeAmount) || chargeAmount <= 0) return jr(400, { error: "Invalid amount" });
    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
      creditAmount = chargeAmount;
      creditCurrency = chargeCurrency;
    }
    if (!redirectUrl) return jr(400, { error: "redirectUrl required" });
    if (!FINCRA_CHARGE_CURRENCIES.has(chargeCurrency)) {
      return jr(400, {
        error: `currency must be one of the following values: ${[...FINCRA_CHARGE_CURRENCIES].join(", ")}`,
      });
    }

    if (walletId) {
      const { data: w } = await supabase.from("wallets")
        .select("id, user_id, currency_code").eq("id", walletId).maybeSingle();
      if (!w || w.user_id !== user.id) return jr(403, { error: "Wallet not accessible" });
      const walletCcy = String(w.currency_code).toUpperCase();
      if (walletCcy !== creditCurrency) {
        return jr(400, {
          error: `Wallet currency (${w.currency_code}) does not match credit currency (${creditCurrency})`,
        });
      }
    }

    const { data: rl } = await supabase.rpc("check_rate_limit", {
      p_key: `fincra_topup:${user.id}`,
      p_max_requests: 10,
      p_window_seconds: 60,
    });
    if (rl === false) return jr(429, { error: "Too many requests" });

    const cfg = getFincraConfig();
    if (!cfg.secretKey || !cfg.publicKey) {
      return jr(500, { error: "Fincra is not configured (FINCRA_SECRET_KEY / FINCRA_PUBLIC_KEY)" });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles")
      .select("email, full_name, first_name, last_name, phone").eq("user_id", user.id).maybeSingle();

    const reference = clientRef || `efm_fincra_${user.id.slice(0, 8)}_${Date.now()}`;
    const customerEmail = profile?.email || user.email || `${user.id}@efin.money`;
    const customerName = resolveCustomerName(profile, user);
    const customerPhone = profile?.phone ? String(profile.phone) : undefined;
    const fincraRedirectUrl = normalizeFincraRedirectUrl(redirectUrl);

    const payload: Record<string, unknown> = {
      amount: Math.round(chargeAmount * 100) / 100,
      currency: chargeCurrency,
      redirectUrl: fincraRedirectUrl,
      reference,
      feeBearer: "customer",
      settlementDestination: "wallet",
      customer: {
        name: customerName,
        email: customerEmail,
        ...(customerPhone ? { phoneNumber: customerPhone } : {}),
      },
      metadata: {
        user_id: user.id,
        type: "wallet_topup",
        currency: creditCurrency,
        credit_currency: creditCurrency,
        credit_amount: Math.round(creditAmount * 100) / 100,
        charge_currency: chargeCurrency,
        charge_amount: Math.round(chargeAmount * 100) / 100,
        ...(walletId ? { wallet_id: walletId } : {}),
      },
      paymentMethods: PAYMENT_METHODS_BY_CCY[chargeCurrency] ?? ["card", "bank_transfer"],
    };

    const requestedMethods = Array.isArray(body?.paymentMethods)
      ? (body.paymentMethods as unknown[]).map((m) => String(m).trim()).filter(Boolean)
      : [];
    const allowed = PAYMENT_METHODS_BY_CCY[chargeCurrency] ?? ["card", "bank_transfer"];
    if (requestedMethods.length) {
      const filtered = requestedMethods.filter((m) => allowed.includes(m) || m === "bank_transfer");
      if (filtered.length) payload.paymentMethods = filtered;
    }

    const purpose = String(body?.purpose || body?.type || "wallet_topup");
    const transferId = body?.transfer_id ? String(body.transfer_id) : "";
    const meta = payload.metadata as Record<string, unknown>;
    meta.purpose = purpose;
    meta.type = purpose === "send" || purpose === "bank_send"
      ? "bank_send"
      : purpose === "bank_move"
        ? "bank_move"
        : (meta.type || "wallet_topup");
    if (transferId) meta.transfer_id = transferId;

    const { ok, status, json } = await fincraFetch("/checkout/payments", {
      method: "POST",
      body: JSON.stringify(payload),
      withPublicKey: true,
    });

    if (!ok) {
      const msg = String(json?.message || json?.error || `Failed to initialize checkout (HTTP ${status})`);
      return jr(200, { success: false, error: msg, provider_status: status });
    }

    const data = json?.data as Record<string, unknown> | undefined;
    return jr(200, {
      success: true,
      payment_link: data?.link,
      reference: data?.reference ?? reference,
      pay_code: data?.payCode,
      charge_currency: chargeCurrency,
      charge_amount: chargeAmount,
      credit_currency: creditCurrency,
      credit_amount: creditAmount,
    });
  } catch (err) {
    console.error("fincra-initialize-checkout error", err);
    return jr(500, { success: false, error: err instanceof Error ? err.message : "Unknown error" });
  }
});
