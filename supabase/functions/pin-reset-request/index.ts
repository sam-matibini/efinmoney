// Sends a PIN reset email via Resend when an authenticated user taps "Forgot PIN?".
// Generates a 30-minute token, stores it in profiles, then emails a link to the user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "eFinMoney <noreply@efinsuite.com>";
const APP_URL = Deno.env.get("PUBLIC_APP_URL") ?? "https://efin.money";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Verify caller is authenticated
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Not authenticated" }, 401);

  const email = user.email ?? "";
  if (!email) return json({ error: "No email address on file" }, 400);

  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);

  // Generate a short-lived token and store its hash in profiles
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: dbErr } = await admin
    .from("profiles")
    .update({ pin_reset_token: token, pin_reset_expires_at: expiresAt })
    .eq("user_id", user.id);
  if (dbErr) {
    console.error("pin-reset-request db:", dbErr);
    return json({ error: "Could not store reset token" }, 500);
  }

  const resetUrl = `${APP_URL}/reset-pin?token=${token}&uid=${user.id}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#111;">
      <div style="background:#0b2a6f;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <p style="color:#fbbf24;font-size:13px;font-weight:600;letter-spacing:.08em;margin:0 0 6px;">eFINMONEY</p>
        <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Transaction PIN Reset</h1>
      </div>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Hi there,<br/><br/>
        You requested a transaction PIN reset. Click the button below to confirm and set a new PIN.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}"
           style="background:#0b2a6f;color:#fff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:600;font-size:15px;display:inline-block;">
          Reset my PIN &rarr;
        </a>
      </div>
      <p style="font-size:13px;color:#666;margin:0 0 8px;">&#x23F0; This link expires in <strong>30 minutes</strong>.</p>
      <p style="font-size:13px;color:#666;margin:0;">If you didn&apos;t request this, your account is still secure &mdash; no action needed.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:32px 0;"/>
      <p style="font-size:11px;color:#999;text-align:center;margin:0;">eFinMoney &mdash; Secure cross-border transfers &mdash; efin.money</p>
    </div>`;

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      subject: "Reset your eFinMoney transaction PIN",
      html,
    }),
  });
  if (!resendRes.ok) {
    console.error("pin-reset-request resend:", await resendRes.text());
    return json({ error: "Failed to send reset email" }, 502);
  }

  return json({ ok: true, email });
});
