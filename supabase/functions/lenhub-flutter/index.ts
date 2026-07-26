/**
 * Lenhub Flutter helper API — quote, banks, verify, networks, card steps, VA.
 * POST { action, ... }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditLenhubFlutterTopup } from "../_shared/lenhub-flutter-credit.ts";
import {
  isLenhubFlutterEnabled,
  getLenhubFlutterWebhookUrl,
  lenhubFlutterConfirmPayment,
  lenhubFlutterCreateCardPayment,
  lenhubFlutterCreateVirtualAccount,
  lenhubFlutterExchangeRate,
  lenhubFlutterGetBanks,
  lenhubFlutterNetworks,
  lenhubFlutterSendOtp,
  lenhubFlutterSendPin,
  lenhubFlutterVerifyAccount,
  pickLenhubCardNextAction,
  pickLenhubCardRedirectUrl,
  supportsLenhubFlutterCollect,
} from "../_shared/lenhub-flutter.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!isLenhubFlutterEnabled()) {
    return json({ error: "Lenhub Flutter rail disabled" }, 503);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization" }, 401);
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action || "").toLowerCase();

  try {
    if (action === "quote" || action === "exchange_rate") {
      const source = String(body.source_currency || "").toUpperCase();
      const dest = String(body.destination_currency || "").toUpperCase();
      const amount = Number(body.amount);
      if (!source || !dest || !(amount > 0)) return json({ error: "source_currency, destination_currency, amount required" }, 400);
      const result = await lenhubFlutterExchangeRate({ sourceCurrency: source, destinationCurrency: dest, amount });
      return json({
        success: result.ok,
        rate: result.rate,
        rate_id: result.rateId,
        source_amount: result.sourceAmount,
        destination_amount: result.destAmount,
        message: result.message,
        provider: result.json,
      }, result.ok ? 200 : 400);
    }

    if (action === "banks") {
      const country = String(body.country_code || body.country || "").toUpperCase();
      if (!country) return json({ error: "country_code required" }, 400);
      const result = await lenhubFlutterGetBanks(country);
      return json({
        success: result.ok,
        banks: result.banks,
        message: result.message,
        provider: result.json,
      }, result.ok ? 200 : 400);
    }

    if (action === "verify") {
      const account_number = String(body.account_number || "");
      const currency = String(body.currency || "").toUpperCase();
      const bank_code = String(body.bank_code || "");
      if (!account_number || !currency || !bank_code) {
        return json({ error: "account_number, currency, bank_code required" }, 400);
      }
      const result = await lenhubFlutterVerifyAccount({ accountNumber: account_number, currency, bankCode: bank_code });
      return json({
        success: result.ok,
        account_name: result.accountName,
        message: result.message,
        provider: result.json,
      }, result.ok ? 200 : 400);
    }

    if (action === "networks") {
      const country = String(body.country || body.country_code || "GH").toUpperCase();
      const result = await lenhubFlutterNetworks(country);
      return json({
        success: result.ok,
        networks: result.networks,
        message: result.message,
        provider: result.json,
      }, result.ok ? 200 : 400);
    }

    if (action === "card_create") {
      const currency = String(body.currency || "").toUpperCase();
      const amount = Number(body.amount);
      const email = String(body.email || user.email || "");
      if (!supportsLenhubFlutterCollect(currency)) {
        return json({ error: `Currency ${currency} not supported for Lenhub Flutter collect` }, 400);
      }
      if (!(amount > 0) || !email) return json({ error: "amount and email required" }, 400);

      const card_number = String(body.card_number || "").replace(/\s+/g, "");
      const expiry_date_month = String(body.expiry_date_month || body.exp_month || "").padStart(2, "0");
      const expiry_date_year = String(body.expiry_date_year || body.exp_year || "");
      const cvv = String(body.cvv || "");
      if (!card_number || !expiry_date_month || !expiry_date_year || !cvv) {
        return json({ error: "card_number, expiry_date_month, expiry_date_year, cvv required" }, 400);
      }

      const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https:\/\/([^.]+)/)?.[1];
      const callbackBase = String(
        body.callback ||
          getLenhubFlutterWebhookUrl() ||
          `https://${projectRef}.supabase.co/functions/v1/lenhub-flutter-webhook`,
      ).replace(/\/+$/, "");

      // Prefer wallet_id from client; fall back to lookup
      let walletId: string | null = typeof body.wallet_id === "string" ? body.wallet_id : null;
      if (!walletId) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("id")
          .eq("user_id", user.id)
          .eq("currency_code", currency)
          .maybeSingle();
        walletId = wallet?.id ?? null;
      }

      let localId: string | null = null;
      const clientPlatform = String(body.client_platform || body.clientPlatform || "web").toLowerCase() === "mobile"
        ? "mobile"
        : "web";
      const { data: row, error: insErr } = await supabase
        .from("lenhub_flutter_charges")
        .insert({
          user_id: user.id,
          wallet_id: walletId,
          currency_code: currency,
          amount,
          email,
          status: "creating",
          provider_response: { client_platform: clientPlatform },
        })
        .select("id")
        .single();

      if (insErr) {
        // Table missing / RLS — still attempt provider charge; surface DB hint
        console.error("lenhub_flutter_charges insert:", insErr.message);
        if (/relation .* does not exist|Could not find the table/i.test(insErr.message)) {
          return json({
            error: "Database table missing. Run migration 20260722020000_lenhub_flutter.sql in Supabase SQL editor, then retry.",
            code: "migration_required",
            detail: insErr.message,
          }, 400);
        }
      } else {
        localId = row?.id ?? null;
      }

      // Stamp local row id so 3DS browser return can match even when FLW refs differ
      const callback = localId
        ? `${callbackBase}${callbackBase.includes("?") ? "&" : "?"}efin_local=${encodeURIComponent(localId)}`
        : callbackBase;

      const result = await lenhubFlutterCreateCardPayment({
        card_number,
        expiry_date_month,
        expiry_date_year: expiry_date_year.length === 4 ? expiry_date_year.slice(-2) : expiry_date_year,
        cvv,
        amount,
        callback,
        email,
        currency,
      });

      // Empty lenhub body { status: success, message: [] } is not a real charge
      const providerEmpty =
        Array.isArray((result.json as { message?: unknown }).message) &&
        ((result.json as { message?: unknown[] }).message?.length ?? 0) === 0;
      const ok = result.ok && Boolean(result.chargeId) && !providerEmpty;
      const failMessage = !ok
        ? (providerEmpty
          ? "Lenhub returned empty success (no charge created). Their Flutterwave card rail is flaky for this card/currency — retry once, or try another card. If it keeps failing, ask Lenhub to check FLW credentials."
          : (result.message || "Card charge failed"))
        : result.message;
      // Prefer an explicit Lenhub type. Vague "pin_or_otp_or_avs" made the UI
      // treat the charge as OTP (string includes "otp") even when none was sent.
      const nextAction = ok ? (result.nextAction || "pin") : null;

      if (localId) {
        await supabase.from("lenhub_flutter_charges").update({
          charge_id: result.chargeId,
          status: ok ? "requires_action" : "failed",
          next_action: nextAction,
          provider_response: { ...(result.json || {}), client_platform: clientPlatform },
          updated_at: new Date().toISOString(),
        }).eq("id", localId);
      }

      return json({
        success: ok,
        local_id: localId,
        charge_id: result.chargeId,
        message: failMessage,
        next_action: nextAction,
        redirect_url: ok ? result.redirectUrl : null,
        provider: result.json,
        db_warning: insErr && !localId ? insErr.message : undefined,
      }, ok ? 200 : 400);
    }

    if (action === "card_pin") {
      const chargeId = String(body.charge_id || body.chargeId || "");
      const pin = String(body.pin || "");
      const localId = body.local_id ? String(body.local_id) : null;
      if (!chargeId || !pin) return json({ error: "charge_id and pin required" }, 400);
      const result = await lenhubFlutterSendPin(pin, chargeId);
      if (localId) {
        await supabase.from("lenhub_flutter_charges").update({
          status: result.ok ? "pin_sent" : "failed",
          next_action: pickLenhubCardNextAction(result.json),
          provider_response: result.json,
          updated_at: new Date().toISOString(),
        }).eq("id", localId).eq("user_id", user.id);
      }
      return json({
        success: result.ok,
        message: result.message,
        next_action: pickLenhubCardNextAction(result.json),
        redirect_url: pickLenhubCardRedirectUrl(result.json),
        provider: result.json,
      }, result.ok ? 200 : 400);
    }

    if (action === "card_otp") {
      const chargeId = String(body.charge_id || body.chargeId || "");
      const otp = String(body.otp || "");
      const localId = body.local_id ? String(body.local_id) : null;
      if (!chargeId || !otp) return json({ error: "charge_id and otp required" }, 400);
      const result = await lenhubFlutterSendOtp(otp, chargeId);
      if (localId) {
        await supabase.from("lenhub_flutter_charges").update({
          status: result.ok ? "otp_sent" : "failed",
          next_action: pickLenhubCardNextAction(result.json),
          provider_response: result.json,
          updated_at: new Date().toISOString(),
        }).eq("id", localId).eq("user_id", user.id);
      }
      return json({
        success: result.ok,
        message: result.message,
        next_action: pickLenhubCardNextAction(result.json),
        redirect_url: pickLenhubCardRedirectUrl(result.json),
        provider: result.json,
      }, result.ok ? 200 : 400);
    }

    if (action === "card_confirm") {
      const charge_id = String(body.charge_id || body.chargeId || "");
      const localId = body.local_id ? String(body.local_id) : null;
      if (!charge_id) return json({ error: "charge_id required" }, 400);
      const city = String(body.city || "").trim();
      const country = String(body.country || "").trim().toUpperCase();
      const line1 = String(body.line1 || "").trim();
      const postal_code = String(body.postal_code || "").trim();
      const state = String(body.state || "").trim();
      if (!city || !country || !line1 || !postal_code || !state) {
        return json({
          error: "city, country, line1, postal_code, and state are required for AVS confirm",
        }, 400);
      }
      const result = await lenhubFlutterConfirmPayment({
        charge_id,
        city,
        country,
        line1,
        postal_code,
        state,
        line2: body.line2 != null ? String(body.line2) : "",
      });
      if (localId) {
        await supabase.from("lenhub_flutter_charges").update({
          status: result.ok ? "confirming" : "failed",
          provider_response: result.json,
          updated_at: new Date().toISOString(),
        }).eq("id", localId).eq("user_id", user.id);
      }
      return json({
        success: result.ok,
        message: result.message,
        provider: result.json,
        next_action: result.ok ? pickLenhubCardNextAction(result.json) : null,
        redirect_url: result.ok ? pickLenhubCardRedirectUrl(result.json) : null,
      }, result.ok ? 200 : 400);
    }

    if (action === "virtual_account") {
      const email = String(body.email || user.email || "");
      const amount = Number(body.amount);
      const currency = String(body.currency || "NGN").toUpperCase();
      const narration = String(body.narration || `eFin top-up ${user.id.slice(0, 8)}`);
      if (!email || !(amount > 0)) return json({ error: "email and amount required" }, 400);
      if (!supportsLenhubFlutterCollect(currency)) {
        return json({ error: `Currency ${currency} not supported for Lenhub Flutter collect` }, 400);
      }

      let walletId: string | null = typeof body.wallet_id === "string" ? body.wallet_id : null;
      if (!walletId) {
        const { data: wallet } = await supabase
          .from("wallets")
          .select("id")
          .eq("user_id", user.id)
          .eq("currency_code", currency)
          .maybeSingle();
        walletId = wallet?.id ?? null;
      }

      let localId: string | null = null;
      const { data: row, error: insErr } = await supabase
        .from("lenhub_flutter_charges")
        .insert({
          user_id: user.id,
          wallet_id: walletId,
          currency_code: currency,
          amount,
          email,
          status: "creating_va",
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("lenhub_flutter_charges VA insert:", insErr.message);
      } else {
        localId = row?.id ?? null;
      }

      const result = await lenhubFlutterCreateVirtualAccount({ email, amount, narration });
      const va = result.va;
      const providerRef = va.orderRef || va.flwRef;
      const settleAmount = va.amount != null && va.amount > 0 ? va.amount : amount;
      const ok = result.ok && Boolean(va.accountNumber);

      if (localId) {
        await supabase.from("lenhub_flutter_charges").update({
          charge_id: providerRef,
          amount: settleAmount,
          status: ok ? "awaiting_transfer" : "va_failed",
          next_action: "bank_transfer",
          provider_response: result.json,
          updated_at: new Date().toISOString(),
        }).eq("id", localId);
      }

      return json({
        success: ok,
        message: ok ? (result.message || "Virtual account created") : (result.message || "Could not create virtual account"),
        local_id: localId,
        charge_id: providerRef,
        virtual_account: ok
          ? {
              account_number: va.accountNumber,
              account_name: va.accountName,
              bank_name: va.bankName,
              amount: settleAmount,
              currency: va.currency || currency,
              order_ref: va.orderRef,
              flw_ref: va.flwRef,
              expiry: va.expiry,
            }
          : null,
        provider: result.json,
      }, ok ? 200 : 400);
    }

    // Client settle when Lenhub VA success webhooks never arrive (known gap).
    // Credits the caller's own awaiting_transfer charge — idempotent via ledger ref.
    if (action === "settle_va" || action === "confirm_paid") {
      const localChargeId = String(body.local_id || body.id || "").trim();
      const providerChargeId = String(body.charge_id || "").trim();
      const accountNumber = String(body.account_number || "").trim();
      if (!localChargeId && !providerChargeId && !accountNumber) {
        return json({ error: "local_id, charge_id, or account_number required" }, 400);
      }

      let row: Record<string, unknown> | null = null;
      if (localChargeId) {
        const { data } = await supabase
          .from("lenhub_flutter_charges")
          .select("*")
          .eq("user_id", user.id)
          .eq("id", localChargeId)
          .maybeSingle();
        row = data;
      }
      if (!row && providerChargeId) {
        const { data } = await supabase
          .from("lenhub_flutter_charges")
          .select("*")
          .eq("user_id", user.id)
          .eq("charge_id", providerChargeId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        row = data;
      }
      if (!row && accountNumber) {
        const { data: recent } = await supabase
          .from("lenhub_flutter_charges")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "awaiting_transfer")
          .is("credited_at", null)
          .order("created_at", { ascending: false })
          .limit(25);
        row = (recent || []).find((r) =>
          JSON.stringify(r.provider_response || {}).includes(accountNumber),
        ) ?? null;
      }
      if (!row) return json({ error: "Charge not found" }, 404);
      if (row.credited_at) {
        return json({
          success: true,
          already_credited: true,
          status: row.status,
          credited_at: row.credited_at,
          amount: row.amount,
          currency: row.currency_code,
          local_id: row.id,
        });
      }
      const allowed = ["awaiting_transfer", "requires_action", "pin_sent", "otp_sent"];
      if (!allowed.includes(String(row.status))) {
        return json({
          error: `Cannot settle charge in status ${row.status}`,
          status: row.status,
        }, 400);
      }

      const settleId = String(row.charge_id || row.id);
      const credit = await creditLenhubFlutterTopup(supabase, {
        userId: user.id,
        walletId: (row.wallet_id as string | null) ?? null,
        currency: String(row.currency_code),
        amount: Number(row.amount),
        chargeRowId: String(row.id),
        chargeId: settleId,
      });

      const now = new Date().toISOString();
      await supabase.from("lenhub_flutter_charges").update({
        status: credit.credited ? "credited_manual" : `settle_${credit.reason}`,
        credited_at: credit.credited ? now : null,
        next_action: null,
        provider_response: {
          ...(typeof row.provider_response === "object" && row.provider_response
            ? row.provider_response as Record<string, unknown>
            : {}),
          manual_settle: {
            at: now,
            by: user.id,
            reason: "client_confirm_paid_webhook_missing",
          },
        },
        updated_at: now,
      }).eq("id", row.id).eq("user_id", user.id);

      if (credit.credited) {
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "Wallet topped up",
          message: `${row.currency_code} ${row.amount} has been added to your wallet.`,
          type: "wallet",
        });
      }

      return json({
        success: credit.credited,
        credited: credit.credited,
        reason: credit.reason,
        amount: row.amount,
        currency: row.currency_code,
        local_id: row.id,
        message: credit.credited
          ? "Wallet credited (manual settle — Lenhub webhook was missing)"
          : `Could not credit: ${credit.reason}`,
      }, credit.credited || credit.reason === "already_credited" ? 200 : 400);
    }

    if (action === "va_status" || action === "check_va") {
      const localChargeId = String(body.local_id || body.id || "");
      const providerChargeId = String(body.charge_id || "");
      if (!localChargeId && !providerChargeId) {
        return json({ error: "local_id or charge_id required" }, 400);
      }
      let q = supabase.from("lenhub_flutter_charges").select("*").eq("user_id", user.id);
      if (localChargeId) q = q.eq("id", localChargeId);
      else q = q.eq("charge_id", providerChargeId);
      const { data: row } = await q.maybeSingle();
      if (!row) return json({ error: "Charge not found" }, 404);
      return json({
        success: true,
        status: row.status,
        credited: Boolean(row.credited_at),
        credited_at: row.credited_at,
        amount: row.amount,
        currency: row.currency_code,
        charge_id: row.charge_id,
        local_id: row.id,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("lenhub-flutter error", msg);
    return json({ error: msg }, 400);
  }
});
