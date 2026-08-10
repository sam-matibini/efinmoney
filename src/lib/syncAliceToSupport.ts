import { supabase } from "@/integrations/supabase/client";
import type { AliceMessage } from "@/hooks/useAliceChat";

const db = supabase as unknown as { from: (t: string) => any };

export function aliceChannelRef(conversationId: string) {
  return `alice:${conversationId}`;
}

function formatTurn(userText: string, aliceText: string) {
  return [`You: ${userText.trim()}`, `Alice: ${aliceText.trim()}`].join("\n\n");
}

function formatTranscript(messages: AliceMessage[]) {
  return messages
    .filter((m) => !m.pending && m.content.trim())
    .map((m) => (m.role === "user" ? `You: ${m.content.trim()}` : `Alice: ${m.content.trim()}`))
    .join("\n\n");
}

/**
 * Upsert a Support CRM thread for an Alice conversation and append the latest turn.
 * Idempotent via channel_ref = alice:<conversationId>. Does not spam staff email
 * on every turn — use escalateAliceToSupport for human handoff alerts.
 */
export async function syncAliceTurnToSupport(opts: {
  conversationId: string;
  title?: string | null;
  userText: string;
  aliceText: string;
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid || !opts.conversationId) return null;

  const channelRef = aliceChannelRef(opts.conversationId);
  const preview = opts.userText.trim().slice(0, 280);
  const subject = (opts.title?.trim() || opts.userText.trim() || "Alice conversation").slice(0, 80);
  const body = formatTurn(opts.userText, opts.aliceText);

  const { data: existing } = await db
    .from("support_threads")
    .select("id")
    .eq("channel_ref", channelRef)
    .maybeSingle();

  let threadId = (existing as { id?: string } | null)?.id ?? null;

  if (!threadId) {
    const { data: thread, error } = await db
      .from("support_threads")
      .insert({
        user_id: uid,
        subject,
        channel: "alice",
        channel_ref: channelRef,
        status: "open",
        priority: "normal",
        unread_for_staff: false,
        unread_for_user: false,
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[alice→support] create thread failed", error.message);
      return null;
    }
    threadId = (thread as { id: string }).id;
  } else {
    await db
      .from("support_threads")
      .update({
        status: "open",
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
        subject,
      })
      .eq("id", threadId);
  }

  const { error: mErr } = await db.from("support_messages").insert({
    thread_id: threadId,
    sender_role: "user",
    sender_id: uid,
    body: `🤖 Alice AI\n\n${body}`,
  });
  if (mErr) {
    console.warn("[alice→support] append message failed", mErr.message);
    return threadId;
  }

  return threadId;
}

/**
 * Ensure the Alice CRM thread exists with a full transcript snapshot, mark it
 * unread for staff, and notify the support team (human escalate).
 */
export async function escalateAliceToSupport(opts: {
  conversationId: string | null;
  title?: string | null;
  messages: AliceMessage[];
}): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;

  const usable = opts.messages.filter((m) => !m.pending && m.content.trim());
  const lastUser = [...usable].reverse().find((m) => m.role === "user")?.content ?? "Help from Alice";
  let conversationId = opts.conversationId;

  // If Alice chat hasn't persisted yet, create a lightweight conversation id via channel_ref alone is not enough —
  // require a real alice conversation when possible.
  if (!conversationId) {
    const { data: conv, error } = await db
      .from("alice_conversations")
      .insert({ user_id: uid, context: "user", title: lastUser.slice(0, 60) })
      .select("id")
      .single();
    if (error || !conv) {
      console.warn("[alice→support] escalate: no conversation", error?.message);
      return null;
    }
    conversationId = (conv as { id: string }).id;
  }

  const channelRef = aliceChannelRef(conversationId);
  const transcript = formatTranscript(usable);
  const subject = `Alice escalate: ${(opts.title?.trim() || lastUser).slice(0, 60)}`;
  const preview = lastUser.slice(0, 280);

  const { data: existing } = await db
    .from("support_threads")
    .select("id")
    .eq("channel_ref", channelRef)
    .maybeSingle();

  let threadId = (existing as { id?: string } | null)?.id ?? null;

  const isNew = !threadId;

  if (!threadId) {
    const { data: thread, error } = await db
      .from("support_threads")
      .insert({
        user_id: uid,
        subject,
        channel: "alice",
        channel_ref: channelRef,
        status: "open",
        priority: "high",
        unread_for_staff: true,
        unread_for_user: false,
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[alice→support] escalate create failed", error.message);
      return null;
    }
    threadId = (thread as { id: string }).id;
  } else {
    await db
      .from("support_threads")
      .update({
        status: "open",
        priority: "high",
        unread_for_staff: true,
        subject,
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadId);
  }

  const body = isNew
    ? transcript
      ? `🚨 Customer asked to talk to a human (via Alice)\n\n--- Alice transcript ---\n\n${transcript}`
      : "🚨 Customer asked to talk to a human (via Alice). No prior Alice messages."
    : "🚨 Customer asked to talk to a human again (via Alice).";

  await db.from("support_messages").insert({
    thread_id: threadId,
    sender_role: "user",
    sender_id: uid,
    body,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("user_id", uid)
    .maybeSingle();

  // Notify staff on first escalate (and when re-opening an existing Alice thread).
  supabase.functions
    .invoke("notify-staff", {
      body: {
        type: isNew ? "new_thread" : "reply",
        thread_id: threadId,
        subject,
        preview: body.slice(0, 300),
        sender_name:
          (profile as { full_name?: string; email?: string } | null)?.full_name ||
          (profile as { email?: string } | null)?.email ||
          "A customer",
      },
    })
    .catch(() => {});

  return threadId;
}

/** Look up the CRM thread id for an Alice conversation (if already synced). */
export async function findAliceSupportThreadId(conversationId: string | null): Promise<string | null> {
  if (!conversationId) return null;
  const { data } = await db
    .from("support_threads")
    .select("id")
    .eq("channel_ref", aliceChannelRef(conversationId))
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}
