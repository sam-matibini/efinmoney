// Sends an email when a user opens or replies to a support thread.
// The shared support inbox is always the primary recipient; individual admins
// are BCC'd so they're alerted outside the portal. Recipients respect
// assignment: an unassigned thread alerts every admin, an assigned one only its
// assignee. Called client-side after thread/message insert — no JWT required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM = "eFinMoney Support <noreply@efinsuite.com>";
const SUPPORT_TO = Deno.env.get("SUPPORT_INBOX") || "support@efin.money";
const ADMIN_SUPPORT_URL = "https://efin.money/admin/support";
const STAFF_ROLES = ["admin", "finance", "compliance"];

// The individual admin emails to BCC — the thread's assignee if assigned,
// otherwise every staff member. Best-effort: on any failure we still email the
// shared inbox.
async function adminBccList(threadId: string): Promise<string[]> {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: thread } = await supabase
      .from("support_threads").select("assigned_to").eq("id", threadId).maybeSingle();

    let ids: string[];
    if (thread?.assigned_to) {
      ids = [thread.assigned_to as string];
    } else {
      const { data: roles } = await supabase
        .from("user_roles").select("user_id").in("role", STAFF_ROLES);
      ids = [...new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))];
    }
    if (!ids.length) return [];

    const { data: profs } = await supabase
      .from("profiles").select("email").in("user_id", ids);
    return [...new Set(
      (profs ?? [])
        .map((p: { email: string | null }) => p.email)
        .filter((e: string | null): e is string => !!e && e !== SUPPORT_TO),
    )];
  } catch (e) {
    console.error("adminBccList", e);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 500);

  try {
    const { type, subject, preview, sender_name, thread_id } = await req.json().catch(() => ({}));
    if (!subject || !thread_id) return json({ error: "Missing required fields" }, 400);

    const isNew = type === "new_thread";
    const emailSubject = isNew
      ? `[New ticket] ${subject}`
      : `[Reply] ${subject}`;

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#222;max-width:560px;">
        <div style="background:#1a237e;padding:20px 24px;border-radius:8px 8px 0 0;">
          <span style="color:#fff;font-weight:700;font-size:16px;">eFinMoney Support</span>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
          <h2 style="margin:0 0 8px;font-size:18px;color:#1a237e;">
            ${isNew ? "New support ticket opened" : "New reply on ticket"}
          </h2>
          <p style="margin:0 0 16px;color:#555;font-size:14px;">
            ${sender_name ? `<strong>${sender_name}</strong> ` : "A customer "}${isNew ? "opened a new ticket" : "replied to a ticket"}.
          </p>
          <div style="background:#f5f7ff;border-left:4px solid #3949ab;padding:12px 16px;border-radius:0 6px 6px 0;margin-bottom:20px;">
            <p style="margin:0 0 4px;font-weight:600;font-size:14px;color:#1a237e;">${subject}</p>
            ${preview ? `<p style="margin:0;font-size:13px;color:#555;white-space:pre-wrap;">${preview}</p>` : ""}
          </div>
          <a href="${ADMIN_SUPPORT_URL}" style="display:inline-block;background:#3949ab;color:#fff;font-weight:700;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;">
            View in Support Inbox →
          </a>
          <p style="margin:20px 0 0;font-size:12px;color:#999;">Thread ID: ${thread_id}</p>
        </div>
      </div>`;

    const bcc = await adminBccList(thread_id);
    const payload: Record<string, unknown> = { from: FROM, to: [SUPPORT_TO], subject: emailSubject, html };
    if (bcc.length) payload.bcc = bcc;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("Resend error", await res.text());
      return json({ error: "Failed to send notification" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("notify-staff", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
