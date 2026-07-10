// Public contact form → emails the support inbox via Resend.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "eFinMoney <noreply@efinsuite.com>";
const SUPPORT_TO = Deno.env.get("SUPPORT_INBOX") || "support@efin.money";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { name, email, subject, message, company } = await req.json().catch(() => ({}));

    // Honeypot: bots fill hidden "company" field — silently accept, don't send.
    if (company) return json({ ok: true });

    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return json({ error: "Name, email and message are required." }, 400);
    }
    if (!isEmail(email.trim())) return json({ error: "Please enter a valid email address." }, 400);
    if (!RESEND_API_KEY) return json({ error: "Email is not configured." }, 500);

    const subj = subject?.trim() ? subject.trim() : "New contact message";
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;">
      <h2 style="margin:0 0 12px;">New contact message</h2>
      <p><strong>Name:</strong> ${esc(name)}</p>
      <p><strong>Email:</strong> ${esc(email)}</p>
      ${subject?.trim() ? `<p><strong>Subject:</strong> ${esc(subject)}</p>` : ""}
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap;background:#f6f6f8;padding:12px;border-radius:8px;">${esc(message)}</p>
    </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM,
        to: [SUPPORT_TO],
        reply_to: email.trim(),
        subject: `[Contact] ${subj}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error("Resend error", await res.text());
      return json({ error: "Could not send your message. Please try again later." }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("contact-message", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
