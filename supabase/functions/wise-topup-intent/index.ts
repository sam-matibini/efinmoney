/**
 * Wise bank-deposit top-up intents.
 * Create → show account details + unique payment reference → poll until webhook credits wallet.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getWiseConfig, wiseFetch, resolveWiseProfileId, wiseTokenDiagnostics } from "../_shared/wise.ts";

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

type DetailField = { type?: string; label?: string; title?: string; value?: string; body?: string; hidden?: boolean };
type ReceiveOption = { type?: string; title?: string; details?: DetailField[] };
type AccountDetail = {
  id?: number | null;
  status?: string;
  currency?: { code?: string } | string;
  receiveOptions?: ReceiveOption[];
};

function currencyCodeOf(row: AccountDetail): string {
  if (typeof row.currency === "string") return row.currency.toUpperCase();
  return String(row.currency?.code || "").toUpperCase();
}

function pickReceiveDetails(row: AccountDetail): { optionType: string; fields: Array<{ label: string; value: string }> } | null {
  const options = Array.isArray(row.receiveOptions) ? row.receiveOptions : [];
  const local = options.find((o) => String(o.type).toUpperCase() === "LOCAL");
  const intl = options.find((o) => String(o.type).toUpperCase() === "INTERNATIONAL");
  const chosen = local || intl || options[0];
  if (!chosen) return null;
  const fields = (chosen.details || [])
    .filter((d) => {
      const hidden = Boolean((d as DetailField & { hidden?: boolean }).hidden);
      const value = String((d as DetailField & { body?: string }).value || (d as { body?: string }).body || "").trim();
      return !hidden && value;
    })
    .map((d) => ({
      label: String(
        (d as DetailField).label ||
          (d as { title?: string }).title ||
          (d as DetailField).type ||
          "Detail",
      ),
      value: String((d as DetailField).value || (d as { body?: string }).body || ""),
    }));
  if (fields.length === 0) return null;
  return { optionType: String(chosen.type || chosen.title || "LOCAL"), fields };
}

async function fetchActiveAccountDetails(currency: string): Promise<{
  fields: Array<{ label: string; value: string }> | null;
  optionType: string | null;
  currenciesActive: string[];
  profileId: string;
}> {
  const cfg = getWiseConfig();
  if (!cfg.apiToken) throw new Error("WISE_API_TOKEN not configured");

  const profileId = await resolveWiseProfileId();
  const res = await wiseFetch(`/v1/profiles/${encodeURIComponent(profileId)}/account-details`);
  if (!res.ok) {
    const sca = res.scaResult ? ` sca=${res.scaResult}` : "";
    throw new Error(
      `Wise account-details failed (${res.status})${sca}: ${JSON.stringify(res.json).slice(0, 240)}`,
    );
  }
  const rows = Array.isArray(res.json) ? res.json as AccountDetail[] : [];
  const activeRows = rows.filter((r) => String(r.status).toUpperCase() === "ACTIVE");
  const currenciesActive = [...new Set(activeRows.map(currencyCodeOf).filter(Boolean))];
  const ccy = currency.toUpperCase();
  const match = activeRows.find((r) => currencyCodeOf(r) === ccy);
  if (!match) {
    console.warn("wise-topup-intent: no ACTIVE details for", ccy, "have", currenciesActive, "profile", profileId);
    return { fields: null, optionType: null, currenciesActive, profileId };
  }
  const picked = pickReceiveDetails(match);
  if (!picked) {
    return { fields: null, optionType: null, currenciesActive, profileId };
  }
  return { fields: picked.fields, optionType: picked.optionType, currenciesActive, profileId };
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
    const cfg = getWiseConfig();
    // Token alone is enough; profile is resolved via /v2/profiles when needed
    const configured = Boolean(cfg.apiToken);

    if (req.method === "GET") {
      const url = new URL(req.url);
      if (url.searchParams.get("diagnose") === "1") {
        const tokenDiag = wiseTokenDiagnostics();
        const out: Record<string, unknown> = { ok: false, ...tokenDiag };
        try {
          const profileId = await resolveWiseProfileId();
          out.profile_id_resolved = profileId;
          const details = await wiseFetch(`/v1/profiles/${encodeURIComponent(profileId)}/account-details`);
          out.account_details_status = details.status;
          out.account_details_sca = details.scaResult;
          if (details.ok && Array.isArray(details.json)) {
            const rows = details.json as AccountDetail[];
            out.currencies_active = [
              ...new Set(
                rows
                  .filter((r) => String(r.status).toUpperCase() === "ACTIVE")
                  .map(currencyCodeOf)
                  .filter(Boolean),
              ),
            ];
            out.ok = true;
          } else {
            out.account_details_error = details.json;
          }
        } catch (e) {
          out.error = e instanceof Error ? e.message : String(e);
        }
        return json(out, out.ok ? 200 : 502);
      }

      const intentId = url.searchParams.get("intent_id");
      if (intentId) {
        const { data, error } = await admin
          .from("wise_topup_intents")
          .select("id, amount, currency_code, reference, status, created_at, expires_at, credited_at")
          .eq("id", intentId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Intent not found" }, 404);
        return json({ intent: data, configured });
      }

      const { data: pending } = await admin
        .from("wise_topup_intents")
        .select("id, amount, currency_code, reference, status, created_at, expires_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      return json({ configured, pending: pending ?? [] });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      amount?: number;
      wallet_id?: string;
      intent_id?: string;
    };
    const action = String(body.action || "create").toLowerCase();

    if (action === "diagnose") {
      const tokenDiag = wiseTokenDiagnostics();
      const out: Record<string, unknown> = { ok: false, ...tokenDiag };
      try {
        const profileId = await resolveWiseProfileId();
        out.profile_id_resolved = profileId;
        const details = await wiseFetch(`/v1/profiles/${encodeURIComponent(profileId)}/account-details`);
        out.account_details_status = details.status;
        out.account_details_sca = details.scaResult;
        if (details.ok && Array.isArray(details.json)) {
          const rows = details.json as AccountDetail[];
          out.currencies_active = [
            ...new Set(
              rows
                .filter((r) => String(r.status).toUpperCase() === "ACTIVE")
                .map(currencyCodeOf)
                .filter(Boolean),
            ),
          ];
          out.ok = true;
        } else {
          out.account_details_error = details.json;
          out.error = `account-details ${details.status}`;
        }
      } catch (e) {
        out.error = e instanceof Error ? e.message : String(e);
      }
      return json(out, out.ok ? 200 : 502);
    }

    if (action === "cancel") {
      const intentId = String(body.intent_id || "");
      if (!intentId) return json({ error: "intent_id required" }, 400);
      const { data, error } = await admin
        .from("wise_topup_intents")
        .update({ status: "cancelled" })
        .eq("id", intentId)
        .eq("user_id", user.id)
        .eq("status", "pending")
        .select("id, status")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Intent not found or not pending" }, 404);
      return json({ ok: true, intent: data });
    }

    if (!configured) {
      return json({
        error: "Wise top-up is not configured yet. Set WISE_API_TOKEN and WISE_PROFILE_ID.",
        code: "wise_not_configured",
      }, 503);
    }

    const amount = Number(body.amount);
    const walletId = String(body.wallet_id || "");
    if (!Number.isFinite(amount) || amount < 1) {
      return json({ error: "Enter an amount of at least 1.00" }, 400);
    }
    if (!walletId) return json({ error: "wallet_id required" }, 400);

    const { data: wallet, error: wErr } = await admin
      .from("wallets")
      .select("id, user_id, currency_code")
      .eq("id", walletId)
      .maybeSingle();
    if (wErr || !wallet || wallet.user_id !== user.id) {
      return json({ error: "Wallet not found" }, 404);
    }

    const currency = String(wallet.currency_code).toUpperCase();
    let receive: Awaited<ReturnType<typeof fetchActiveAccountDetails>>;
    try {
      receive = await fetchActiveAccountDetails(currency);
    } catch (e) {
      console.error("wise-topup-intent account-details", e);
      return json({
        error: e instanceof Error ? e.message : "Could not load Wise account details",
        code: "wise_account_details_failed",
      }, 502);
    }
    if (!receive.fields || !receive.optionType) {
      const have = receive.currenciesActive.length
        ? ` Active on Wise: ${receive.currenciesActive.join(", ")}.`
        : " No ACTIVE receive currencies on this Wise profile yet — open balances and issue account details in Wise Business.";
      return json({
        error: `Wise does not have ACTIVE receive account details for ${currency}.${have}`,
        code: "currency_unsupported",
        currencies_active: receive.currenciesActive,
        profile_id: receive.profileId,
      }, 400);
    }

    await admin
      .from("wise_topup_intents")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const reference = `efm-wise-${user.id.slice(0, 8)}-${Date.now()}`;
    const rounded = Math.round(amount * 100) / 100;
    const { data: intent, error: insErr } = await admin
      .from("wise_topup_intents")
      .insert({
        user_id: user.id,
        wallet_id: walletId,
        amount: rounded,
        currency_code: currency,
        reference,
        status: "pending",
      })
      .select("id, amount, currency_code, reference, status, created_at, expires_at")
      .single();

    if (insErr || !intent) {
      return json({ error: insErr?.message || "Could not create Wise top-up intent" }, 500);
    }

    return json({
      ok: true,
      intent,
      receive_option: receive.optionType,
      account_details: receive.fields,
      instructions: [
        `Send exactly ${currency} ${rounded.toFixed(2)} to the Wise account below.`,
        `Put this payment reference in the transfer description / reference field: ${reference}`,
        `Your ${currency} wallet credits when Wise confirms the deposit (usually within minutes).`,
        `Do not send a different amount — exact match is required.`,
      ],
    });
  } catch (err) {
    console.error("wise-topup-intent error:", err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
});
