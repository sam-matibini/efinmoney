// Public contact form → creates a guest support thread (so it lands in the
// /admin/support inbox where staff reply) and emails the support inbox as a
// best-effort backup.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

// Best-effort email to the support inbox; never blocks the request.
async function emailSupport(name: string, email: string, subject: string, message: string) {
  if (!RESEND_API_KEY) return;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;">
      <h2 style="margin:0 0 12px;">New contact message</h2>
      <p><strong>Name:</strong> ${esc(name)}</p>
      <p><strong>Email:</strong> ${esc(email)}</p>
      ${subject ? `<p><strong>Subject:</strong> ${esc(subject)}</p>` : ""}
      <p><strong>Message:</strong></p>
      <p style="white-space:pre-wrap;background:#f6f6f8;padding:12px;border-radius:8px;">${esc(message)}</p>
      <p style="margin-top:16px;"><a href="https://efin.money/admin/support">Reply in the Support Inbox →</a></p>
    </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM,
        to: [SUPPORT_TO],
        reply_to: email,
        subject: `[Contact] ${subject || "New contact message"}`,
        html,
      }),
    });
    if (!res.ok) console.error("Resend error", await res.text());
  } catch (e) {
    console.error("emailSupport", e);
  }
}

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

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanMessage = message.trim();
    const subj = subject?.trim() ? subject.trim() : "New contact message";

    // Primary: land the message in the support inbox as a guest thread. The
    // AFTER-INSERT trigger on support_messages fills the thread preview and
    // notifies staff.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: thread, error: tErr } = await supabase
      .from("support_threads")
      .insert({ subject: subj, guest_name: cleanName, guest_email: cleanEmail, channel: "contact" })
      .select("id")
      .single();
    if (tErr) {
      console.error("thread insert", tErr);
      return json({ error: "Could not send your message. Please try again later." }, 502);
    }

    const { error: mErr } = await supabase
      .from("support_messages")
      .insert({ thread_id: thread.id, sender_role: "user", sender_id: null, body: cleanMessage });
    if (mErr) {
      console.error("message insert", mErr);
      return json({ error: "Could not send your message. Please try again later." }, 502);
    }

    // Backup: email the support inbox too (non-blocking).
    await emailSupport(cleanName, cleanEmail, subject?.trim() ? subject.trim() : "", cleanMessage);

    return json({ ok: true });
  } catch (e) {
    console.error("contact-message", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
