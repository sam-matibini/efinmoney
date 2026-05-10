import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    let SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SERVICE_KEY) SERVICE_KEY = Deno.env.get("SUPABASE_SECRET_KEYS")!;
    if (!SERVICE_KEY) SERVICE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    console.log("SK len:", SERVICE_KEY?.length || 0, "AK len:", ANON_KEY?.length || 0);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const email = body.email;
    const userIdFromBody = body.user_id;
    if (!email && !userIdFromBody) {
      return new Response(JSON.stringify({ error: "Email or user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the user by email or user_id
    let userId = body.user_id;
    if (!userId && email) {
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id")
        .eq("email", email)
        .maybeSingle();

      if (profile) {
        userId = profile.user_id;
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete related data (skip transfers/ledger for audit integrity)
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("notifications").delete().eq("user_id", userId);
    await admin.from("beneficiaries").delete().eq("user_id", userId);
    await admin.from("cards").delete().eq("user_id", userId);
    // Wallets and transfers are kept for financial audit; delete profile and auth user
    await admin.from("profiles").delete().eq("user_id", userId);

    // Delete auth user
    const deleteRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        method: "DELETE",
        headers: {
          apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      }
    );
    if (!deleteRes.ok) {
      const errBody = await deleteRes.text();
      return new Response(
        JSON.stringify({ error: `Auth delete failed: ${deleteRes.status} - ${errBody}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
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
