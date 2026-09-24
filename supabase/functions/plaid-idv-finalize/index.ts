import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidConfigured, plaidErrorMessage, plaidFetch } from "../_shared/plaid.ts";
import { applyPlaidIdvToKyc } from "../_shared/plaidIdv.ts";
import { upsertPlaidMonitorIndividual } from "../_shared/plaidMonitor.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
    if (!plaidConfigured()) return jsonResponse({ error: "Plaid is not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as { identity_verification_id?: string };
    let idvId = String(body.identity_verification_id || "").trim();

    if (!idvId) {
      const { data: kyc } = await supabase
        .from("kyc_verifications")
        .select("plaid_identity_verification_id")
        .eq("user_id", user.id)
        .maybeSingle();
      idvId = String(kyc?.plaid_identity_verification_id || "").trim();
    }
    if (!idvId) return jsonResponse({ error: "identity_verification_id required" }, 400);

    const getRes = await plaidFetch("/identity_verification/get", {
      identity_verification_id: idvId,
    });
    if (!getRes.ok) {
      return jsonResponse({ error: plaidErrorMessage(getRes.json) }, 400);
    }

    const status = String(getRes.json.status || "");
    const clientUserId = String(
      (getRes.json.client_user_id as string) ||
        ((getRes.json.user as Record<string, unknown> | undefined)?.client_user_id as string) ||
        user.id,
    );
    if (clientUserId && clientUserId !== user.id) {
      return jsonResponse({ error: "IDV session does not belong to this user" }, 403);
    }

    const applied = await applyPlaidIdvToKyc(supabase, {
      userId: user.id,
      identityVerificationId: idvId,
      status,
      payload: getRes.json,
    });
    if (!applied.ok) return jsonResponse({ error: applied.error }, 500);

    if (status === "success") {
      try {
        await upsertPlaidMonitorIndividual(supabase, { userId: user.id, idvPayload: getRes.json });
      } catch (e) {
        console.warn("plaid-idv-finalize: monitor upsert failed", e);
      }
    }

    return jsonResponse({
      ok: true,
      identity_verification_id: idvId,
      status,
      verification_status: applied.verification_status,
    });
  } catch (e) {
    console.error("plaid-idv-finalize", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
