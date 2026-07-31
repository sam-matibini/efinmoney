// Staff-initiated outbound communications from the CRM Communication Hub.
// Email is delivered via Resend. Channels without a provider (SMS/WhatsApp)
// and interaction records (calls, meetings, notes) are stored as "logged"
// rather than pretending they were delivered.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const FROM = "eFinMoney <noreply@efinsuite.com>";
const ATTACHMENT_BUCKET = "communication-attachments";
const LINK_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Channels we can actually deliver right now. */
const DELIVERABLE = new Set(["email", "in_app"]);
const ALL_CHANNELS = new Set([
  "email",
  "in_app",
  "sms",
  "whatsapp",
  "push",
  "phone_call",
  "meeting",
  "note",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface AttachmentInput {
  file_name: string;
  file_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
}

function emailHtml(args: {
  recipientName: string;
  subject: string;
  content: string;
  links: { name: string; url: string }[];
}) {
  const bodyHtml = escapeHtml(args.content).replace(/\n/g, "<br />");
  const docs = args.links.length
    ? `
      <div style="margin:24px 0;padding:16px 20px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
        <p style="margin:0 0 10px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Attached documents</p>
        ${args.links
          .map(
            (l) =>
              `<p style="margin:0 0 8px"><a href="${l.url}" style="color:#4f46e5;font-weight:600;text-decoration:none">${escapeHtml(l.name)}</a></p>`,
          )
          .join("")}
        <p style="margin:10px 0 0;color:#94a3b8;font-size:12px">These secure links expire in 7 days.</p>
      </div>`
    : "";

  return `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(args.subject)}</h1>
      ${args.recipientName ? `<p style="line-height:1.55;margin:0 0 12px">Hi ${escapeHtml(args.recipientName)},</p>` : ""}
      <div style="line-height:1.6;font-size:15px">${bodyHtml}</div>
      ${docs}
      <p style="margin:28px 0 0;color:#64748b;font-size:13px">— The eFinMoney team</p>
    </div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user) return json({ error: "Unauthorized" }, 401);
    const staffId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Only admin/support staff may send on behalf of the platform.
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", staffId);
    const isStaff = (roles || []).some((r) => r.role === "admin" || r.role === "support");
    if (!isStaff) return json({ error: "Staff access required" }, 403);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const channel = String(body.channel || "").trim();
    const subject = String(body.subject || "").trim();
    const content = String(body.content || "").trim();
    const customerId = typeof body.customer_id === "string" && body.customer_id ? body.customer_id : null;
    const targetUserId = typeof body.user_id === "string" && body.user_id ? body.user_id : null;
    const recipientEmail = String(body.recipient_email || "").trim().toLowerCase();
    const recipientName = String(body.recipient_name || "").trim();
    const attachments = Array.isArray(body.attachments)
      ? (body.attachments as AttachmentInput[]).filter((a) => a?.file_name && a?.file_path)
      : [];

    if (!ALL_CHANNELS.has(channel)) return json({ error: "Unsupported channel" }, 400);
    if (!content) return json({ error: "Message content is required" }, 400);
    if (content.length > 20000) return json({ error: "Message is too long" }, 400);
    if (channel === "email") {
      if (!recipientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
        return json({ error: "A valid recipient email is required for email messages" }, 400);
      }
      if (!subject) return json({ error: "Subject is required for email messages" }, 400);
    }
    if (channel === "in_app" && !targetUserId) {
      return json({ error: "In-app messages need an app user as the recipient" }, 400);
    }

    // Signed links for any attached documents (private bucket, never public).
    const links: { name: string; url: string }[] = [];
    for (const a of attachments) {
      const { data: signed } = await admin.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(a.file_path, LINK_TTL_SECONDS);
      if (signed?.signedUrl) links.push({ name: a.file_name, url: signed.signedUrl });
    }

    let status = "logged";
    let errorMessage: string | null = null;
    const metadata: Record<string, unknown> = {
      sent_by: staffId,
      attachment_count: attachments.length,
    };

    if (channel === "email") {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) {
        status = "failed";
        errorMessage = "Email provider is not configured";
      } else {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM,
            to: [recipientEmail],
            subject,
            html: emailHtml({ recipientName, subject, content, links }),
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (res.ok) {
          status = "sent";
          metadata.provider = "resend";
          metadata.provider_message_id = (payload as { id?: string })?.id ?? null;
        } else {
          status = "failed";
          errorMessage =
            (payload as { message?: string })?.message || `Email provider returned ${res.status}`;
          metadata.provider_response = payload;
        }
      }
    } else if (channel === "in_app") {
      const { error: notifErr } = await admin.from("notifications").insert({
        user_id: targetUserId,
        title: subject || "Message from eFinMoney",
        message: content,
        type: "message",
      });
      if (notifErr) {
        status = "failed";
        errorMessage = notifErr.message;
      } else {
        status = "sent";
      }
    } else {
      // sms / whatsapp / push / phone_call / meeting / note
      metadata.logged_reason =
        channel === "sms" || channel === "whatsapp" || channel === "push"
          ? "No provider connected for this channel — recorded only"
          : "Interaction recorded by staff";
    }

    const { data: comm, error: insErr } = await admin
      .from("customer_communications")
      .insert({
        customer_id: customerId,
        user_id: targetUserId,
        channel,
        direction: "outbound",
        subject: subject || null,
        content,
        status,
        recipient_email: recipientEmail || null,
        recipient_name: recipientName || null,
        error_message: errorMessage,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        created_by: staffId,
        metadata,
      })
      .select("id")
      .single();

    if (insErr) return json({ error: insErr.message }, 500);

    if (attachments.length) {
      const { error: attErr } = await admin.from("communication_attachments").insert(
        attachments.map((a) => ({
          communication_id: comm.id,
          file_name: a.file_name,
          file_path: a.file_path,
          mime_type: a.mime_type ?? null,
          size_bytes: a.size_bytes ?? null,
          uploaded_by: staffId,
        })),
      );
      if (attErr) console.error("attachment link failed", attErr.message);
    }

    if (status === "failed") {
      return json({ error: errorMessage || "Send failed", communication_id: comm.id }, 502);
    }

    return json({ success: true, communication_id: comm.id, status });
  } catch (e) {
    console.error("send-communication error", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
