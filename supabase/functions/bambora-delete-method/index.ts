/**
 * Delete saved Bambora card or bank profile method.
 * Body: { methodId } or { methodId, deleteProfile? }
 */
import { bamboraDeleteProfile, bamboraDeleteProfileCard, getBamboraConfig } from "../_shared/bambora.ts";
import { corsHeaders, json, requireUser } from "../_shared/bambora-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user, admin } = auth;

    const cfg = getBamboraConfig();
    if (!cfg.profilesPasscode) return json(503, { error: "Bambora profiles not configured" });

    const body = await req.json().catch(() => ({}));
    const methodId = String(body.methodId || body.method_id || "").trim();
    const deleteProfile = Boolean(body.deleteProfile);

    if (!methodId) return json(400, { error: "methodId required" });

    const { data: method } = await admin.from("bambora_payment_methods")
      .select("*")
      .eq("id", methodId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!method) return json(404, { error: "Payment method not found" });

    if (method.method_type === "card" && method.bambora_card_id) {
      const del = await bamboraDeleteProfileCard(
        String(method.customer_code),
        Number(method.bambora_card_id),
      );
      if (!del.ok && del.status !== 404) {
        return json(400, { error: String(del.json.message || "Could not delete card") });
      }
    } else if (deleteProfile || method.method_type === "bank") {
      const del = await bamboraDeleteProfile(String(method.customer_code));
      if (!del.ok && del.status !== 404) {
        return json(400, { error: String(del.json.message || "Could not delete profile") });
      }
    }

    await admin.from("bambora_payment_methods").delete().eq("id", methodId);
    if (deleteProfile) {
      await admin.from("bambora_payment_methods")
        .delete()
        .eq("user_id", user.id)
        .eq("customer_code", method.customer_code);
    }

    return json(200, { success: true });
  } catch (err) {
    console.error("bambora-delete-method", err);
    return json(500, { error: err instanceof Error ? err.message : "Delete failed" });
  }
});
