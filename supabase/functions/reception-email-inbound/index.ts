/**
 * reception-email-inbound
 * ───────────────────────
 * Resend inbound webhook: receives emails sent to support@efin.money,
 * then creates (or updates) a support thread in /admin/support so staff
 * can reply from inside the eFinMoney admin panel.
 *
 * Webhook URL (paste into Resend → Inbound → Route → Webhook):
 *   https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/reception-email-inbound
 *
 * Emails from Reception AI (call summaries, booking notifications) are
 * tagged channel = "reception". All other senders are tagged channel = "contact".
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, svix-id, svix-timestamp, svix-signature",
};

// Domains that Reception AI sends from
const RECEPTION_DOMAINS = ["reception.ai", "receptionai.com", "elevenlabs.io"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return resp({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return resp({ error: "invalid json" }, 400);
  }

  // Resend wraps inbound email under body.data (type: "email.received")
  const email = body?.data ?? body;
  const fromRaw: string = email?.from ?? "";
  const subject: string = email?.subject ?? "(no subject)";
  const textBody: string = email?.text ?? "";
  const htmlBody: string = email?.html ?? "";

  // Extract sender name + email address
  // "from" can be "John Doe <john@example.com>" or just "john@example.com"
  const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s*)?<?([^\s>]+@[^\s>]+)>?$/);
  const senderName: string = fromMatch?.[1]?.trim() || fromRaw;
  const senderEmail: string = (fromMatch?.[2]?.trim() || fromRaw).toLowerCase();
  const senderDomain = senderEmail.split("@")[1] ?? "";

  // Skip emails we sent ourselves (prevent loops)
  if (["efin.money", "efinsuite.com"].includes(senderDomain)) {
    return resp({ skipped: "own domain" });
  }

  const isReception = RECEPTION_DOMAINS.some((d) => senderDomain.endsWith(d)) ||
    /reception\s*ai|call\s+summary|booking\s+(confirmation|via)|new\s+(voicemail|call)/i.test(subject);

  const channel = isReception ? "reception" : "contact";

  // Best plaintext: prefer text body, strip HTML tags as fallback
  const bodyText = textBody.trim() ||
    htmlBody.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();

  // Limit preview + body length
  const preview = bodyText.slice(0, 280);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Try to match sender to an existing user account
  let userId: string | null = null;
  if (senderEmail) {
    const { data: p } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", senderEmail)
      .maybeSingle();
    userId = (p as { user_id?: string } | null)?.user_id ?? null;
  }

  // Idempotency: one thread per sender+subject (avoids duplicates on retries)
  const channelRef = `email:${senderEmail}:${subject}`.slice(0, 255);
  const { data: existing } = await supabase
    .from("support_threads")
    .select("id")
    .eq("channel_ref", channelRef)
    .maybeSingle();

  let threadId: string;

  if (existing?.id) {
    // Append new message to existing thread (e.g. a reply chain)
    threadId = existing.id;
    await supabase
      .from("support_threads")
      .update({
        unread_for_staff: true,
        status: "open",
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadId);
  } else {
    // New thread
    const threadInsert: Record<string, unknown> = {
      subject: subject.slice(0, 200),
      channel,
      channel_ref: channelRef,
      status: "open",
      priority: "normal",
      unread_for_staff: true,
      last_message_preview: preview,
      last_message_at: new Date().toISOString(),
    };

    if (userId) {
      threadInsert.user_id = userId;
    } else {
      threadInsert.guest_name = senderName || senderEmail;
      threadInsert.guest_email = senderEmail;
    }

    const { data: thread, error: tErr } = await supabase
      .from("support_threads")
      .insert(threadInsert)
      .select("id")
      .single();

    if (tErr || !thread) {
      console.error("reception-email-inbound: thread insert failed", tErr);
      return resp({ error: tErr?.message ?? "insert failed" }, 500);
    }
    threadId = (thread as { id: string }).id;
  }

  // Insert the email body as a message
  const { error: mErr } = await supabase.from("support_messages").insert({
    thread_id: threadId,
    sender_role: "user",
    sender_id: userId ?? null,
    body: bodyText.slice(0, 8000) || subject,
  });

  if (mErr) {
    console.error("reception-email-inbound: message insert failed", mErr);
    return resp({ error: mErr.message }, 500);
  }

  // Notify all admins
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "finance", "compliance"]);

  if (admins?.length) {
    await supabase.from("admin_notifications").insert(
      admins.map((a: { user_id: string }) => ({
        admin_id: a.user_id,
        type: "support_message",
        payload: { thread_id: threadId, preview },
      })),
    );
  }

  return resp({ ok: true, thread_id: threadId, channel });
});

function resp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
