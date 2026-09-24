import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { plaidConfigured, plaidErrorMessage, plaidFetch } from "../_shared/plaid.ts";

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
    if (!getRes.ok) return jsonResponse({ error: plaidErrorMessage(getRes.json) }, 400);

    return jsonResponse({
      identity_verification_id: idvId,
      status: getRes.json.status,
      data: getRes.json,
    });
  } catch (e) {
    console.error("plaid-idv-get", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
