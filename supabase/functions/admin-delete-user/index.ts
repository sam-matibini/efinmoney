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
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const userId = body.user_id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete public data first
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("notifications").delete().eq("user_id", userId);
    await admin.from("beneficiaries").delete().eq("user_id", userId);
    await admin.from("cards").delete().eq("user_id", userId);
    await admin.from("profiles").delete().eq("user_id", userId);

    // Delete auth user with retry
    let lastError = null;
    for (let i = 0; i < 3; i++) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (!error) {
        return new Response(
          JSON.stringify({ success: true, user_id: userId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      lastError = error;
      console.log(`Delete attempt ${i + 1} failed:`, error.message);
      await new Promise((r) => setTimeout(r, 1000));
    }

    return new Response(
      JSON.stringify({ error: lastError?.message || "Delete failed after retries" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
