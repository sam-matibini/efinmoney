/**
 * Lenhub Flutter webhook / payment callback.
 * Settles card top-ups and bank/MoMo payouts.
 *
 * Browser 3DS returns (Flutterwave) hit this as GET with ?response=<json>
 * — we settle the charge then 302 back to the app top-up page.
 * Server-to-server webhooks keep returning JSON.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditLenhubFlutterTopup } from "../_shared/lenhub-flutter-credit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function appBaseUrl(): string {
  return (Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://www.efin.money")
    .replace(/\/+$/, "");
}

/** True when Flutterwave redirected a human browser (not a JSON webhook POST). */
function isBrowserReturn(req: Request, url: URL): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (url.searchParams.has("response") || url.searchParams.has("efin_local")) return true;
  const accept = (req.headers.get("accept") || "").toLowerCase();
  if (accept.includes("text/html")) return true;
  const mode = (req.headers.get("sec-fetch-mode") || "").toLowerCase();
  return mode === "navigate" || mode === "nested-navigate";
}

function buildAppRedirect(opts: {
  outcome: "success" | "failed" | "pending";
  walletId?: string | null;
  chargeId?: string | null;
  message?: string | null;
  /** When true, 302 to efinmoney:// so the Expo app can catch the return. */
  mobile?: boolean;
}): Response {
  if (opts.mobile) {
    const q = new URLSearchParams();
    q.set("lenhub", opts.outcome);
    if (opts.walletId) q.set("walletId", opts.walletId);
    if (opts.chargeId) q.set("charge_id", opts.chargeId);
    if (opts.message) q.set("msg", opts.message.slice(0, 180));
    return Response.redirect(`efinmoney://wallet/topup?${q.toString()}`, 302);
  }
  const u = new URL(`${appBaseUrl()}/wallet/topup`);
  u.searchParams.set("lenhub", opts.outcome);
  if (opts.walletId) u.searchParams.set("walletId", opts.walletId);
  if (opts.chargeId) u.searchParams.set("charge_id", opts.chargeId);
  if (opts.message) u.searchParams.set("msg", opts.message.slice(0, 180));
  return Response.redirect(u.toString(), 302);
}

function chargeIsMobile(charge: Record<string, unknown> | null): boolean {
  if (!charge) return false;
  const pr = charge.provider_response;
  if (pr && typeof pr === "object" && !Array.isArray(pr)) {
    const platform = String((pr as Record<string, unknown>).client_platform || "").toLowerCase();
    if (platform === "mobile") return true;
  }
  return false;
}

/**
 * Flutterwave browser callback puts the whole transaction JSON in ?response=.
 * Also accept nested data / message envelopes from Lenhub server webhooks.
 */
function normalizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const responseRaw = raw.response;
  if (typeof responseRaw === "string" && responseRaw.trim()) {
    try {
      const parsed = JSON.parse(responseRaw) as Record<string, unknown>;
      return { ...raw, ...parsed, _efin_local: raw.efin_local || raw.efin_charge };
    } catch {
      /* keep raw */
    }
  }
  if (responseRaw && typeof responseRaw === "object" && !Array.isArray(responseRaw)) {
    return { ...raw, ...(responseRaw as Record<string, unknown>) };
  }
  const data = raw.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...raw, ...(data as Record<string, unknown>) };
  }
  return raw;
}

function pickStatus(payload: Record<string, unknown>): string {
  const data = (payload.data || payload) as Record<string, unknown>;
  const msg = payload.message;
  const msgObj = msg && typeof msg === "object" && !Array.isArray(msg)
    ? (msg as Record<string, unknown>)
    : null;
  const nestedStatus = msgObj?.status;
  const nested =
    nestedStatus && typeof nestedStatus === "object" && !Array.isArray(nestedStatus)
      ? (nestedStatus as Record<string, unknown>).status
      : nestedStatus;
  const raw = data.status ?? payload.status ?? nested ?? msgObj?.event ?? payload.event ?? "";
  return String(raw).toLowerCase();
}

function pickFailureMessage(payload: Record<string, unknown>): string | null {
  const keys = [
    "vbvrespmessage",
    "chargeResponseMessage",
    "processor_response",
    "message",
  ];
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "unauthorized") {
      return v.trim();
    }
  }
  return null;
}

function pickChargeId(payload: Record<string, unknown>): string | null {
  const data = (payload.data || payload) as Record<string, unknown>;
  const id =
    data.charge_id ||
    data.chargeId ||
    data.order_ref ||
    data.orderRef ||
    data.flw_ref ||
    data.flwRef ||
    data.tx_ref ||
    data.txRef ||
    data.id ||
    payload.charge_id ||
    payload.chargeId ||
    payload.order_ref ||
    payload.flw_ref;
  return id != null ? String(id) : null;
}

/** Collect all plausible refs so VA top-ups (order_ref / flw_ref) still match. */
function pickChargeIdCandidates(payload: Record<string, unknown>): string[] {
  const data = (payload.data || payload) as Record<string, unknown>;
  const keys = [
    "charge_id", "chargeId", "order_ref", "orderRef", "flw_ref", "flwRef",
    "tx_ref", "txRef", "id", "reference", "raveRef", "paymentId",
  ];
  const out: string[] = [];
  for (const src of [data, payload]) {
    for (const k of keys) {
      const v = src[k];
      if (v != null && String(v).trim()) {
        const s = String(v).trim();
        if (!out.includes(s)) out.push(s);
      }
    }
  }
  const efinLocal = payload._efin_local || payload.efin_local || payload.efin_charge;
  if (efinLocal != null && String(efinLocal).trim()) {
    const s = String(efinLocal).trim();
    if (!out.includes(s)) out.unshift(s);
  }
  return out;
}

function pickTransferRef(payload: Record<string, unknown>): string | null {
  const data = (payload.data || payload) as Record<string, unknown>;
  const meta = (data.meta || payload.meta || {}) as Record<string, unknown>;
  if (meta.transfer_id) return String(meta.transfer_id);
  const id = data.id || data.reference || data.flw_ref || payload.reference;
  return id != null ? String(id) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const reqUrl = new URL(req.url);
  const browser = isBrowserReturn(req, reqUrl);
  let charge: Record<string, unknown> | null = null;

  try {
    let payload: Record<string, unknown> = {};
    if (req.method === "GET" || req.method === "HEAD") {
      for (const [k, v] of reqUrl.searchParams.entries()) payload[k] = v;
    } else {
      const text = await req.text();
      try {
        payload = text ? JSON.parse(text) as Record<string, unknown> : {};
      } catch {
        payload = { raw: text };
      }
    }
    payload = normalizePayload(payload);

    try {
      await supabase.from("flw_webhook_logs").insert({
        event: "lenhub_flutter",
        payload,
        processed: false,
      });
    } catch { /* optional log table */ }

    const status = pickStatus(payload);
    const eventName = String(payload.event || payload.type || "").toLowerCase();
    const success =
      ["successful", "success", "succeeded", "completed", "paid"].includes(status) ||
      eventName.includes("charge.completed") ||
      eventName.includes("transfer.completed") ||
      eventName.includes("payment.completed");
    const failed = ["failed", "cancelled", "canceled", "reversed"].includes(status);
    const failMsg = pickFailureMessage(payload);

    const chargeCandidates = pickChargeIdCandidates(payload);
    const chargeId = chargeCandidates[0] || pickChargeId(payload);
    charge = null;

    // Prefer our local row id when callback was created with ?efin_local=
    const efinLocal = String(payload._efin_local || payload.efin_local || payload.efin_charge || "").trim();
    if (efinLocal) {
      const { data: byLocal } = await supabase
        .from("lenhub_flutter_charges")
        .select("*")
        .eq("id", efinLocal)
        .limit(1);
      charge = byLocal?.[0] ?? null;
    }

    if (!charge && chargeCandidates.length) {
      const { data: charges } = await supabase
        .from("lenhub_flutter_charges")
        .select("*")
        .in("charge_id", chargeCandidates)
        .limit(1);
      charge = charges?.[0] ?? null;
    }

    // FLW browser callback often has txRef/flwRef we never stored as charge_id —
    // search recent open charges' provider_response for those refs.
    if (!charge && chargeCandidates.length) {
      const { data: recent } = await supabase
        .from("lenhub_flutter_charges")
        .select("*")
        .is("credited_at", null)
        .in("status", ["requires_action", "pin_sent", "otp_sent", "creating", "awaiting_transfer"])
        .order("created_at", { ascending: false })
        .limit(40);
      charge = (recent || []).find((row) => {
        const blob = JSON.stringify(row.provider_response || {});
        return chargeCandidates.some((c) => blob.includes(c));
      }) ?? null;
    }

    // VA webhooks often key off account_number when reference isn't repeated
    if (!charge) {
      const data = (payload.data || payload) as Record<string, unknown>;
      const acct = String(
        data.account_number || data.accountNumber || payload.account_number || "",
      ).trim();
      if (acct) {
        const { data: byAcct } = await supabase
          .from("lenhub_flutter_charges")
          .select("*")
          .is("credited_at", null)
          .filter("provider_response", "cs", JSON.stringify({ account_number: acct }))
          .order("created_at", { ascending: false })
          .limit(5);
        charge = (byAcct || []).find((row) => {
          const pr = JSON.stringify(row.provider_response || {});
          return pr.includes(acct);
        }) ?? null;
        if (!charge) {
          const { data: recent } = await supabase
            .from("lenhub_flutter_charges")
            .select("*")
            .eq("status", "awaiting_transfer")
            .is("credited_at", null)
            .order("created_at", { ascending: false })
            .limit(20);
          charge = (recent || []).find((row) =>
            JSON.stringify(row.provider_response || {}).includes(acct),
          ) ?? null;
        }
      }
    }

    // Last resort for browser return: same amount+currency in last 30 min
    if (!charge && browser) {
      const amount = Number(payload.amount ?? payload.charged_amount);
      const currency = String(payload.currency || "").toUpperCase();
      if (amount > 0 && currency) {
        const since = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: recent } = await supabase
          .from("lenhub_flutter_charges")
          .select("*")
          .eq("currency_code", currency)
          .eq("amount", amount)
          .is("credited_at", null)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5);
        charge = recent?.[0] ?? null;
      }
    }

    if (charge && success && !charge.credited_at) {
      const settleId = String(charge.charge_id || chargeId || charge.id);
      const credit = await creditLenhubFlutterTopup(supabase, {
        userId: String(charge.user_id),
        walletId: (charge.wallet_id as string | null) ?? null,
        currency: String(charge.currency_code),
        amount: Number(charge.amount),
        chargeRowId: String(charge.id),
        chargeId: settleId,
      });
      await supabase.from("lenhub_flutter_charges").update({
        status: credit.credited ? "credited" : `success_${credit.reason}`,
        credited_at: credit.credited ? new Date().toISOString() : null,
        provider_response: payload,
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
      if (credit.credited) {
        await supabase.from("notifications").insert({
          user_id: charge.user_id,
          title: "Wallet topped up",
          message: `${charge.currency_code} ${charge.amount} has been added to your wallet.`,
          type: "wallet",
        });
      }
    } else if (charge && failed) {
      await supabase.from("lenhub_flutter_charges").update({
        status: "failed",
        provider_response: payload,
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
    } else if (charge && browser && !success && !failed) {
      // Still pending after 3DS — keep provider payload for later webhook settle
      await supabase.from("lenhub_flutter_charges").update({
        provider_response: payload,
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
    }

    const providerRef = pickTransferRef(payload);
    if (providerRef) {
      const uuidMatch = providerRef.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      let q = supabase.from("transfers").select("*");
      q = uuidMatch ? q.eq("id", providerRef) : q.eq("provider_reference", providerRef);
      const { data: transfers } = await q.limit(1);
      const transfer = transfers?.[0];
      if (transfer) {
        if (success) {
          await supabase.from("transfers").update({
            status: "completed",
            completed_at: new Date().toISOString(),
          }).eq("id", transfer.id);
          await supabase.from("lenhub_flutter_payouts").update({
            status: "completed",
            provider_response: payload,
            updated_at: new Date().toISOString(),
          }).eq("transfer_id", transfer.id);
          await supabase.from("notifications").insert({
            user_id: transfer.sender_id,
            title: "Transfer complete",
            message: `Your transfer of ${transfer.target_currency} ${transfer.target_amount} to ${transfer.recipient_name} is complete.`,
            type: "transfer",
          });
        } else if (failed && transfer.status !== "failed") {
          await supabase.from("transfers").update({
            status: "failed",
            failure_reason: failMsg || status,
          }).eq("id", transfer.id);
          await supabase.from("lenhub_flutter_payouts").update({
            status: "failed",
            provider_response: payload,
            updated_at: new Date().toISOString(),
          }).eq("transfer_id", transfer.id);
        }
      }
    }

    if (browser) {
      const outcome = success ? "success" : failed ? "failed" : "pending";
      return buildAppRedirect({
        outcome,
        walletId: charge?.wallet_id ? String(charge.wallet_id) : null,
        chargeId: charge?.charge_id ? String(charge.charge_id) : chargeId,
        message: failed ? (failMsg || "Card payment failed") : null,
        mobile: chargeIsMobile(charge),
      });
    }

    return json({
      received: true,
      success,
      failed,
      charge_id: chargeId,
      matched_charge: charge?.id ?? null,
      provider_ref: providerRef,
      message: failMsg,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.error("lenhub-flutter-webhook", msg);
    if (browser) {
      return buildAppRedirect({
        outcome: "failed",
        message: msg,
        mobile: chargeIsMobile(charge),
      });
    }
    return json({ error: msg }, 200);
  }
});
