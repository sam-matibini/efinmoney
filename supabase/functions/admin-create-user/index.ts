import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  fullName?: string;
  phoneNumber?: string;
  countryCode?: string;
  kycStatus?: string;
  kycTier?: string;
  riskScore?: number;
  roles?: string[];
  // When present, the user is created via the Developer tab flow:
  // kyc_tier is forced to tier_0, kyc_status to pending, and the profile is
  // tagged with onboarded_by_admin_id / onboarded_via='admin' / onboarded_at.
  // The handle_new_user trigger uses user_metadata.onboarded_by_admin to
  // switch the welcome email template.
  onboardedByAdminId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleCheck } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: Payload = await req.json();
    if (!body.email) {
      return new Response(JSON.stringify({ error: "Email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Developer-tab flow: caller must have developer_onboarding permission.
    // Mirrors the frontend hasPermission("developer_onboarding") check in
    // AdminAuthContext — that one is role-based (only super_admin for now,
    // pending boss confirmation). When the frontend migrates to also honor
    // the admin_users.permissions jsonb, this check should match that logic.
    // Falls through silently for legacy callers that don't pass onboardedByAdminId.
    if (body.onboardedByAdminId) {
      const { data: callerAdmin } = await admin
        .from("admin_users")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (!callerAdmin || callerAdmin.role !== "super_admin") {
        return new Response(
          JSON.stringify({ error: "developer_onboarding permission required (super_admin role)" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Create real auth user (no password — they'll use magic link / reset)
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: body.email,
        password: tempPassword,
        email_confirm: false,
        // The handle_new_user trigger reads this to switch the email template
        // between 'welcome' (self-signup) and 'admin_invitation' (Developer tab).
        user_metadata: {
          full_name: body.fullName,
          onboarded_by_admin: body.onboardedByAdminId ? "true" : null,
        },
      });
    if (createErr || !created.user) {
      return new Response(
        JSON.stringify({ error: createErr?.message || "Create failed" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const newUserId = created.user.id;

    // The handle_new_user trigger has already created profile + default user role + wallets.
    // Update profile with admin-supplied fields.
    // When the caller is using the Developer tab flow, force kyc_tier=tier_0
    // and kyc_status=pending regardless of what was passed in the payload;
    // the customer always completes their own KYC through the standard flow.
    const isDeveloperTabFlow = !!body.onboardedByAdminId;
    const profileUpdate: Record<string, unknown> = {
      full_name: body.fullName ?? null,
      phone_number: body.phoneNumber ?? null,
      country_code: body.countryCode ?? null,
      kyc_status: isDeveloperTabFlow ? "pending" : (body.kycStatus ?? "pending"),
      kyc_tier: isDeveloperTabFlow ? "tier_0" : (body.kycTier ?? "tier_0"),
      risk_score: body.riskScore ?? 0,
    };
    if (isDeveloperTabFlow && body.onboardedByAdminId) {
      profileUpdate.onboarded_by_admin_id = body.onboardedByAdminId;
      profileUpdate.onboarded_via = "admin";
      profileUpdate.onboarded_at = new Date().toISOString();
    }

    await admin.from("profiles").update(profileUpdate).eq("user_id", newUserId);

    // Add extra roles (skip 'user' since trigger already inserted it)
    const extraRoles = (body.roles || []).filter((r) => r !== "user");
    if (extraRoles.length > 0) {
      await admin.from("user_roles").insert(
        extraRoles.map((role) => ({
          user_id: newUserId,
          role: role as "admin" | "compliance" | "support" | "finance",
        }))
      );
    }

    // Send password recovery email so user can set their own password
    const appUrl = (Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: body.email,
      options: { redirectTo: `${appUrl}/auth/reset-password` },
    });
    if (linkErr) {
      // Recovery link is required for the user to set their password.
      // Don't leave them in limbo — roll back the auth user.
      await admin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: `Failed to generate recovery link: ${linkErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const actionLink = (linkData?.properties as { action_link?: string } | undefined)?.action_link;
    if (!actionLink) {
      await admin.auth.admin.deleteUser(newUserId);
      return new Response(
        JSON.stringify({ error: "Recovery link missing action_link property" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send the admin_invitation email (the trigger skipped it for admin-onboarded users)
    const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        type: "admin_invitation",
        to: body.email,
        data: {
          name: body.fullName,
          action_link: actionLink,
          expires_in_minutes: 60,
        },
      }),
    });
    if (!emailRes.ok) {
      const emailErr = await emailRes.text();
      // User is created, but the email failed. Surface the error in the
      // response so the admin knows. They can use admin-resend-invite to
      // retry once the underlying issue is fixed (e.g., Resend rate limit).
      return new Response(
        JSON.stringify({
          success: true,
          user_id: newUserId,
          email_warning: `User created but invite email failed (${emailRes.status}): ${emailErr}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user_id: newUserId }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
