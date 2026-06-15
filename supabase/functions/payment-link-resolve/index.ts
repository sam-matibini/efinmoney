// Public lookup of a payment link by short code — used by /claim/:code page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get("code") || (req.method === "POST" ? (await req.json().catch(() => ({})))?.code : null);
  if (!code || !/^[A-Z0-9]{4,16}$/i.test(code)) return json({ error: "Invalid code" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Rate limit per IP-ish
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  await admin.rpc("check_rate_limit", { p_key: `plink_resolve:${ip}`, p_max_requests: 60, p_window_seconds: 60 });

  const { data: row, error } = await admin
    .from("payment_link_payouts")
    .select("id, amount, currency, recipient_name, recipient_note, status, expires_at, sender_id, source")
    .eq("short_code", code)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!row) return json({ error: "Link not found" }, 404);

  // Auto-expire stale pending rows
  if (row.status === "pending" && new Date(row.expires_at).getTime() < Date.now()) {
    await admin.from("payment_link_payouts").update({ status: "expired" }).eq("id", row.id);
    row.status = "expired";
  }

  // Look up sender display name
  const { data: senderProfile } = await admin
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("user_id", row.sender_id)
    .maybeSingle();

  return json({
    code,
    amount: row.amount,
    currency: row.currency,
    recipient_name: row.recipient_name,
    note: row.recipient_note,
    status: row.status,
    expires_at: row.expires_at,
    sender_name: senderProfile?.full_name || "An eFinMoney user",
    sender_avatar: senderProfile?.avatar_url || null,
  });
});
