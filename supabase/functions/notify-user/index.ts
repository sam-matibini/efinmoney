import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { kycSendLimitPhrase, limitsFromTierRow, type KycTierKey } from "../_shared/kycLimitCopy.ts";

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
    const tier: KycTierKey = scope === "id_and_address" ? "tier_3" : "tier_2";
    let approvalLimits = limitsFromTierRow(null, tier);
    if (type === "kyc_approved") {
      try {
        const [{ data: applied }, { data: schedule }] = await Promise.all([
          admin.from("user_risk_tiers")
            .select("current_tier, daily_transaction_limit, monthly_transaction_limit, single_transaction_limit, features_enabled")
            .eq("user_id", user_id)
            .maybeSingle(),
          admin.from("tier_limits")
            .select("daily_limit, monthly_limit, single_limit, features_enabled")
            .eq("tier", tier)
            .maybeSingle(),
        ]);
        const source = applied?.current_tier === tier ? applied : schedule;
        approvalLimits = limitsFromTierRow(source, tier);
      } catch (limitErr) {
        console.warn("[notify-user] tier limit lookup failed:", limitErr instanceof Error ? limitErr.message : limitErr);
      }
    }
    const limitPhrase = kycSendLimitPhrase(approvalLimits);
    const messages: Record<string, string> = {
      kyc_approved: scope === "id_and_address"
        ? `Your identity and address have been verified. You can now send ${limitPhrase}.`
        : `Your identity has been verified. You can now send ${limitPhrase}.`,
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

    let emailSent = false;
    let email: string | null = null;
    let emailError: string | null = null;

    // Approval emails the account holder. Profile email is the login address;
    // fall back to the auth user when that column is empty.
    if (type === "kyc_approved") {
      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", user_id)
          .maybeSingle();
        let name = (profile?.full_name || body?.name || "").trim();
        email = (profile?.email || "").trim() || null;
        if (!email) {
          const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user_id);
          if (authErr) console.warn("[notify-user] auth email lookup failed:", authErr.message);
          email = (authUser?.user?.email || "").trim() || null;
          if (!name) name = String(authUser?.user?.user_metadata?.full_name || "").trim();
        }
        if (!email) {
          emailError = "No email address on the user account";
        } else {
          const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SERVICE_KEY}`,
              apikey: SERVICE_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: "kyc_update",
              to: email,
              data: {
                status: "approved",
                scope,
                name,
                daily_limit: approvalLimits.daily,
                monthly_limit: approvalLimits.monthly,
                single_limit: approvalLimits.single,
                international: approvalLimits.international === true,
                virtual_card: approvalLimits.virtualCard === true,
              },
            }),
          });
          const sendBody = await sendRes.json().catch(() => ({}));
          if (!sendRes.ok || sendBody?.error) {
            const providerError = sendBody?.error;
            emailError = typeof providerError === "string"
              ? providerError
              : typeof providerError?.message === "string"
              ? providerError.message
              : "The email provider rejected the notification";
            console.warn("[notify-user] email send failed:", sendRes.status, sendBody);
          } else {
            emailSent = true;
          }
        }
      } catch (emailErr) {
        emailError = emailErr instanceof Error ? emailErr.message : "Email send failed";
        console.warn("[notify-user] email send failed:", emailErr);
      }
    }

    console.log(`[notify-user] queued ${type} for user ${user_id} email_sent=${emailSent}`);
    return json(200, {
      ok: true,
      ...(type === "kyc_approved" ? { email_sent: emailSent, email, email_error: emailError } : {}),
    });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
