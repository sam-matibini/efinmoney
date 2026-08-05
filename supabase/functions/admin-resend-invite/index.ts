import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const { data: callerAdmin } = await admin
      .from("admin_users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!callerAdmin || callerAdmin.role !== "super_admin") {
      return new Response(
        JSON.stringify({ error: "developer_onboarding permission required (super_admin role)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: Payload = await req.json();
    if (!body.email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the target user was actually onboarded by an admin (don't resend
    // recovery emails for arbitrary addresses — that would be a phishing vector).
    const { data: target } = await admin
      .from("profiles")
      .select("user_id, onboarded_via, full_name")
      .eq("email", body.email)
      .maybeSingle();
    if (!target || target.onboarded_via !== "admin") {
      return new Response(
        JSON.stringify({ error: "No admin-onboarded account found for that email" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appUrl = (Deno.env.get("APP_URL") || Deno.env.get("PUBLIC_APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: body.email,
      options: { redirectTo: `${appUrl}/auth/reset-password` },
    });
    if (linkErr) {
      return new Response(
        JSON.stringify({ error: `Failed to send invite: ${linkErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const actionLink = (linkData?.properties as { action_link?: string } | undefined)?.action_link;
    if (!actionLink) {
      return new Response(
        JSON.stringify({ error: "Recovery link missing action_link property" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send the admin_invitation email
    await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        type: "admin_invitation",
        to: body.email,
        data: {
          name: target.full_name || "",
          action_link: actionLink,
          expires_in_minutes: 60,
        },
      }),
    });

    // Push out the orphan deadline by re-stamping onboarded_at. This gives the
    // user another 14 days from now to claim before cleanup kicks in.
    await admin
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("user_id", target.user_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
