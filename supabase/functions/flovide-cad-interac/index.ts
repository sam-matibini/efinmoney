/**
 * Flovide CAD Interac Autodeposit collect.
 * Creates a referenced intent; customer sends Interac to FLOVIDE_CAD_INTERAC_ALIAS
 * (default efin@flovide.com). Settlement via flovide-reconcile polling (no merchant webhook yet).
 *
 * Does NOT use POST /collections/interac (email money-request) — that is OTC-only.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildFlovideAutodepositInstructions,
  flovideConfigured,
  resolveFlovideCadAlias,
} from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const OPEN = ["pending", "awaiting_payment", "processing"];
const COLS =
  "id, amount, currency_code, credit_amount, credit_currency, status, reference, provider_reference, provider_order_id, payer_email, payer_name, purpose, transfer_id, target_wallet_id, created_at, expires_at, credited_at, failure_reason";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const alias = resolveFlovideCadAlias();
    const configured = flovideConfigured() && alias.includes("@");
    const railMeta = {
      configured,
      alias: configured ? alias : null,
      provider: "flovide" as const,
      rail: "flovide_interac",
      mode: "autodeposit" as const,
      eft: null,
      eft_configured: false,
    };

    if (!configured) {
      if (req.method === "GET") {
        return json({ pending: [], ...railMeta, configured: false });
      }
      return json({ error: "Flovide CAD Autodeposit is not configured", code: "provider_not_configured" }, 503);
    }

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

    if (req.method === "GET") {
      const url = new URL(req.url);
      const intentId = url.searchParams.get("intent_id");
      if (intentId) {
        const { data, error } = await admin.from("flovide_transactions").select(COLS)
          .eq("id", intentId).eq("user_id", user.id).maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Intent not found" }, 404);

        // Poll Flovide transactions while webhook is unavailable.
        if (OPEN.includes(String(data.status))) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/flovide-reconcile`, {
              method: "POST",
              headers: {
                Authorization: authHeader,
                apikey: anon,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ intent_id: intentId }),
            });
          } catch (e) {
            console.warn("flovide-cad-interac: reconcile trigger failed", e);
          }
          const { data: fresh } = await admin.from("flovide_transactions").select(COLS)
            .eq("id", intentId).eq("user_id", user.id).maybeSingle();
          return json({ intent: fresh || data, ...railMeta, reconciled: true });
        }

        return json({ intent: data, ...railMeta });
      }
      const { data: pending } = await admin.from("flovide_transactions").select(COLS)
        .eq("user_id", user.id).eq("kind", "interac_collection")
        .in("status", OPEN)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }).limit(5);
      return json({ pending: pending ?? [], ...railMeta });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const amount = Number(body.amount);
    const walletId = String(body.wallet_id || "");
    const payerEmail = String(body.sender_email || body.email || user.email || "").trim().toLowerCase();
    const payerName = String(body.sender_name || body.name || "").trim();
    const purpose = ["topup", "transfer", "merchant_collection"].includes(String(body.purpose))
      ? String(body.purpose)
      : "topup";
    const transferId = typeof body.transfer_id === "string" ? body.transfer_id : null;

    if (!Number.isFinite(amount) || amount < 2) {
      return json({ error: "Amount must be at least CAD 2.00" }, 400);
    }
    if (!walletId) return json({ error: "wallet_id required" }, 400);
    if (!payerEmail.includes("@")) return json({ error: "A valid payer email is required" }, 400);

    const { data: wallet } = await userClient.from("wallets")
      .select("id, user_id, currency_code").eq("id", walletId).maybeSingle();
    if (!wallet || wallet.user_id !== user.id) return json({ error: "Invalid wallet" }, 403);
    if (String(wallet.currency_code).toUpperCase() !== "CAD") {
      return json({ error: "Flovide Interac only supports CAD wallets" }, 400);
    }

    const reference = `EFN-FV-${user.id.slice(0, 8)}-${Date.now()}`.toUpperCase();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const creditAmount = Math.round(amount * 100) / 100;

    const { data: txn, error: insErr } = await admin.from("flovide_transactions").insert({
      user_id: user.id,
      kind: "interac_collection",
      status: "awaiting_payment",
      amount: creditAmount,
      currency_code: "CAD",
      credit_amount: creditAmount,
      credit_currency: "CAD",
      target_wallet_id: walletId,
      purpose,
      transfer_id: transferId,
      payer_email: payerEmail,
      payer_name: payerName || null,
      reference,
      expires_at: expiresAt,
      raw_request: {
        mode: "autodeposit",
        alias,
        amount: creditAmount,
        payerEmail,
        purpose,
        transferId,
      },
    }).select(COLS).single();

    if (insErr || !txn) {
      return json({ error: "Could not record Interac intent", detail: insErr?.message }, 500);
    }

    return json({
      success: true,
      ...railMeta,
      intent: {
        ...txn,
        sender_email: payerEmail,
        payer_email: payerEmail,
        public_id: reference,
      },
      message: `Send CAD ${creditAmount.toFixed(2)} Interac Autodeposit to ${alias}`,
      instructions: buildFlovideAutodepositInstructions(
        creditAmount,
        alias,
        reference,
        payerEmail,
        purpose,
      ),
    });
  } catch (err) {
    console.error("flovide-cad-interac error:", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
