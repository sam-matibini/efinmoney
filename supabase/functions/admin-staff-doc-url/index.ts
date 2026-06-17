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
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json(401, { error: "Unauthenticated" });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: caller } = await admin
      .from("admin_users")
      .select("id, role, status")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (
      !caller ||
      caller.status !== "active" ||
      !["super_admin", "compliance_officer"].includes(caller.role)
    ) {
      return json(403, { error: "Insufficient permissions to view staff documents" });
    }

    const body = await req.json().catch(() => ({}));
    const staffId = body?.staff_id;
    if (!staffId) return json(400, { error: "staff_id is required" });

    const { data: staff } = await admin
      .from("admin_users")
      .select("id_document_url")
      .eq("id", staffId)
      .maybeSingle();
    if (!staff?.id_document_url) return json(404, { error: "No document on file" });

    const { data: signed, error: signErr } = await admin.storage
      .from("staff-documents")
      .createSignedUrl(staff.id_document_url, 60 * 5);
    if (signErr || !signed?.signedUrl) {
      return json(500, { error: signErr?.message || "Could not sign document URL" });
    }

    return json(200, { url: signed.signedUrl });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : "Unknown error" });
  }
});
