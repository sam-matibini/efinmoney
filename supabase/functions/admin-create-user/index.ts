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

    // Create real auth user (no password — they'll use magic link / reset)
    const tempPassword = crypto.randomUUID() + "Aa1!";
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email: body.email,
        password: tempPassword,
        email_confirm: false,
        user_metadata: { full_name: body.fullName },
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
    await admin
      .from("profiles")
      .update({
        full_name: body.fullName ?? null,
        phone_number: body.phoneNumber ?? null,
        country_code: body.countryCode ?? null,
        kyc_status: body.kycStatus ?? "pending",
        kyc_tier: body.kycTier ?? "tier_0",
        risk_score: body.riskScore ?? 0,
      })
      .eq("user_id", newUserId);

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
    await admin.auth.admin.generateLink({
      type: "recovery",
      email: body.email,
    });

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
