import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const { user_id, type, message, reason, scope } = body || {};
    if (!user_id || !type) return json(400, { error: "user_id and type are required" });

    const titles: Record<string, string> = {
      kyc_approved: "Verification approved",
      kyc_rejected: "Verification rejected",
      kyc_info_requested: "More information needed",
      support_reply: "Support replied to your ticket",
    };
    const messages: Record<string, string> = {
      kyc_approved: scope === "id_and_address"
        ? "Your identity and address have been verified. You now have full access (Tier 3)."
        : "Your identity has been verified. You can now use the platform (Tier 2).",
      kyc_rejected: `Your verification was rejected: ${reason || "Please review your submission."}`,
      kyc_info_requested: message || "An administrator has requested more information for your verification.",
      support_reply: message || "Our support team replied to your conversation. Open Support in the app to read it.",
    };

    await admin.from("notifications").insert({
      user_id,
      title: titles[type] || "Update from eFin Money",
      message: messages[type] || message || "",
      type: type === "support_reply" ? "support" : "kyc",
      is_read: false,
    });

    // Send confirmation email for KYC approval
    if (type === "kyc_approved") {
      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", user_id)
          .maybeSingle();
        if (profile?.email) {
          await admin.functions.invoke("send-email", {
            body: {
              type: "kyc_update",
              to: profile.email,
              data: { status: "approved", scope, name: profile.full_name },
            },
          });
        }
      } catch (emailErr) {
        console.warn("[notify-user] email send failed:", emailErr);
      }
    }

    console.log(`[notify-user] queued ${type} for user ${user_id}`);
    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
