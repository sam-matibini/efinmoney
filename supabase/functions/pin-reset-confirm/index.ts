// Public endpoint — no JWT needed.
// Validates the one-time token from the PIN reset email, clears the PIN, and invalidates the token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let token: string, uid: string;
  try {
    ({ token, uid } = await req.json());
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!token || !uid) return json({ error: "Missing token or uid" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile, error: lookupErr } = await admin
    .from("profiles")
    .select("user_id, pin_reset_expires_at")
    .eq("user_id", uid)
    .eq("pin_reset_token", token)
    .maybeSingle();

  if (lookupErr) {
    console.error("pin-reset-confirm lookup:", lookupErr);
    return json({ error: "Database error" }, 500);
  }
  if (!profile) {
    return json({ ok: false, error: "Invalid or expired reset link — please request a new one." });
  }
  if (!profile.pin_reset_expires_at || new Date(profile.pin_reset_expires_at) < new Date()) {
    return json({ ok: false, error: "This reset link has expired — please request a new one." });
  }

  // Clear the PIN and the token in one update
  const { error: updateErr } = await admin
    .from("profiles")
    .update({
      transaction_pin_hash: null,
      transaction_pin_set_at: null,
      transaction_pin_failed_attempts: 0,
      transaction_pin_locked_until: null,
      pin_reset_token: null,
      pin_reset_expires_at: null,
    })
    .eq("user_id", uid);

  if (updateErr) {
    console.error("pin-reset-confirm update:", updateErr);
    return json({ error: "Failed to clear PIN" }, 500);
  }

  return json({ ok: true });
});
