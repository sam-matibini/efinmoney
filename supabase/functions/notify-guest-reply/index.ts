// Emails a guest (no-account) customer when support staff reply to their
// thread. Guest threads come from the public Contact form / live chat and have
// no in-app bell, so email is how the reply reaches them.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "eFinMoney Support <noreply@efinsuite.com>";
const REPLY_TO = Deno.env.get("SUPPORT_INBOX") || "support@efin.money";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);

  try {
    const { guest_email, guest_name, subject, preview } = await req.json().catch(() => ({}));
    if (!guest_email || !isEmail(String(guest_email))) return json({ error: "Valid guest_email required" }, 400);
    if (!preview) return json({ error: "Missing reply body" }, 400);

    const ticket = subject || "your support request";
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;max-width:560px;">
        <div style="background:#1a237e;padding:20px 24px;border-radius:8px 8px 0 0;">
          <span style="color:#fff;font-weight:700;font-size:16px;">eFinMoney Support</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;color:#555;font-size:14px;">
            Hi ${guest_name ? esc(String(guest_name)) : "there"}, our team replied to <strong>${esc(String(ticket))}</strong>:
          </p>
          <div style="background:#f5f7ff;border-left:4px solid #3949ab;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
            <p style="margin:0;font-size:14px;color:#333;white-space:pre-wrap;">${esc(String(preview))}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#777;">Just reply to this email to continue the conversation.</p>
        </div>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM,
        to: [String(guest_email)],
        reply_to: REPLY_TO,
        subject: `Re: ${ticket}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error("Resend error", await res.text());
      return json({ error: "Failed to send reply email" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("notify-guest-reply", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
