import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidConfigured, plaidErrorMessage, plaidFetch } from "../_shared/plaid.ts";
import { applyPlaidIdvToKyc } from "../_shared/plaidIdv.ts";
import { upsertPlaidMonitorIndividual } from "../_shared/plaidMonitor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    if (!plaidConfigured()) return jsonResponse({ error: "Plaid not configured" }, 500);

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const webhookType = String(payload.webhook_type || "").toUpperCase();
    const webhookCode = String(payload.webhook_code || "").toUpperCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    console.log("plaid-webhook", { webhookType, webhookCode });

    // Identity Verification
    if (webhookType === "IDENTITY_VERIFICATION") {
      const idvId = String(payload.identity_verification_id || "").trim();
      if (!idvId) return jsonResponse({ ok: true, skipped: "no idv id" });

      const getRes = await plaidFetch("/identity_verification/get", {
        identity_verification_id: idvId,
      });
      if (!getRes.ok) {
        console.error("plaid-webhook idv get failed", plaidErrorMessage(getRes.json));
        return jsonResponse({ error: plaidErrorMessage(getRes.json) }, 400);
      }

      const userId = String(
        getRes.json.client_user_id ||
          ((getRes.json.user as Record<string, unknown> | undefined)?.client_user_id) ||
          "",
      );
      if (!userId) return jsonResponse({ ok: true, skipped: "no client_user_id" });

      const status = String(getRes.json.status || "");
      const applied = await applyPlaidIdvToKyc(supabase, {
        userId,
        identityVerificationId: idvId,
        status,
        payload: getRes.json,
      });
      if (!applied.ok) return jsonResponse({ error: applied.error }, 500);

      if (status === "success") {
        try {
          await upsertPlaidMonitorIndividual(supabase, { userId, idvPayload: getRes.json });
        } catch (e) {
          console.warn("monitor upsert after idv webhook", e);
        }
      }

      return jsonResponse({ ok: true, type: "IDENTITY_VERIFICATION", status: applied.verification_status });
    }

    // Monitor individual screening updates
    if (webhookType === "SCREENING" || webhookType === "ENTITY_SCREENING") {
      const screeningId = String(payload.screening_id || "").trim();
      if (!screeningId) return jsonResponse({ ok: true, skipped: "no screening_id" });

      const path = webhookType === "ENTITY_SCREENING"
        ? "/watchlist_screening/entity/get"
        : "/watchlist_screening/individual/get";
      const getRes = await plaidFetch(path, { watchlist_screening_id: screeningId });
      if (!getRes.ok) {
        console.error("plaid-webhook screening get failed", plaidErrorMessage(getRes.json));
        return jsonResponse({ error: plaidErrorMessage(getRes.json) }, 400);
      }

      const status = String(getRes.json.status || "pending_review");
      const clientUserId = String(getRes.json.client_user_id || "");

      const { data: entity } = await supabase
        .from("plaid_monitor_entities")
        .select("id, user_id")
        .eq("screening_id", screeningId)
        .maybeSingle();

      if (entity) {
        await supabase.from("plaid_monitor_entities").update({
          status,
          raw_payload: getRes.json,
          updated_at: new Date().toISOString(),
        }).eq("id", entity.id);
      }

      await supabase.from("plaid_monitor_hits").insert({
        screening_id: screeningId,
        entity_row_id: entity?.id ?? null,
        user_id: entity?.user_id || clientUserId || null,
        webhook_code: `${webhookType}:${webhookCode}`,
        status,
        raw_payload: getRes.json,
      });

      return jsonResponse({ ok: true, type: webhookType, status });
    }

    // ITEM webhooks etc. — acknowledge
    return jsonResponse({ ok: true, ignored: true, webhookType, webhookCode });
  } catch (e) {
    console.error("plaid-webhook", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
