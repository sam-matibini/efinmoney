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
          .select("id, amount, currency_code, reference, status, created_at, expires_at, credited_at")
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
        .select("id, amount, currency_code, reference, status, created_at, expires_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
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
      sender_bank?: string;
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
        .eq("status", "pending")
        .select("id, status")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Intent not found or not pending" }, 404);
      return json({ ok: true, intent: data });
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
    const senderBank = String(body.sender_bank || "").trim();
    if (senderName.length < 2 || senderName.length > 100) {
      return json({ error: "Enter the sender's full name (2-100 characters)" }, 400);
    }
    if (!EMAIL_RE.test(senderEmail) || senderEmail.length > 255) {
      return json({ error: "Enter a valid sender email address" }, 400);
    }
    if (senderBank.length > 100) {
      return json({ error: "Sending bank must be 100 characters or less" }, 400);
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

    // Expire stale pending intents for this user
    await admin
      .from("fincra_cad_interac_intents")
      .update({ status: "expired" })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());

    const reference = `efm-interac-${user.id.slice(0, 8)}-${Date.now()}`;
    const { data: intent, error: insErr } = await admin
      .from("fincra_cad_interac_intents")
      .insert({
        user_id: user.id,
        wallet_id: walletId,
        amount: Math.round(amount * 100) / 100,
        currency_code: "CAD",
        reference,
        status: "pending",
        sender_name: senderName,
        sender_email: senderEmail,
        sender_bank: senderBank || null,
      })
      .select(
        "id, amount, currency_code, reference, status, created_at, expires_at, sender_name, sender_email, sender_bank",
      )
      .single();

    if (insErr || !intent) {
      return json({ error: insErr?.message || "Could not create Interac intent" }, 500);
    }

    return json({
      ok: true,
      alias,
      intent,
      instructions: [
        `Open your Canadian banking app and send an Interac e-Transfer.`,
        `Send exactly CAD ${intent.amount} to ${alias}.`,
        `Put the reference ${intent.reference} in the message field.`,
        `Send from ${senderEmail} so we can match your deposit.`,
        `Autodeposit is enabled — no security question needed.`,
        `Your CAD wallet credits when the transfer arrives (usually within minutes).`,
      ],
    });

  } catch (err) {
    console.error("fincra-cad-interac error:", err);
    return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
  }
});
