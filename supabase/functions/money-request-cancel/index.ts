// Cancel an open money request (requester only).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Not authenticated" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const id = String(body?.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "id required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: row, error } = await admin
    .from("money_requests")
    .select("id, requester_id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return json({ error: "Not found" }, 404);
  if (row.requester_id !== userData.user.id) return json({ error: "Forbidden" }, 403);
  if (!["pending", "awaiting_payment"].includes(row.status)) {
    return json({ error: `Cannot cancel a ${row.status} request` }, 409);
  }

  const { error: upErr } = await admin
    .from("money_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (upErr) return json({ error: upErr.message }, 500);

  return json({ ok: true });
});
