// tawk.to webhook → in-app support inbox.
// Mirrors live-chat conversations into support_threads/support_messages so
// staff see and answer them in /admin/support alongside every other channel.
// Threads are keyed by the tawk chatId (channel_ref) for idempotency.
//
// Configure in tawk.to → Administration → Webhooks:
//   URL:    https://<project-ref>.supabase.co/functions/v1/tawk-webhook
//   Events: Chat Start, Chat Transcript Created
// Copy the signing secret into the TAWK_WEBHOOK_SECRET function secret.
//
// tawk signs the raw request body with HMAC-SHA256 (hex) in X-Tawk-Signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-tawk-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SECRET = Deno.env.get("TAWK_WEBHOOK_SECRET") || "";
const enc = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSignature(raw: string, signature: string | null): Promise<boolean> {
  if (!SECRET || !signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, signature.trim());
}

type Supabase = ReturnType<typeof createClient>;

async function getOrCreateThread(
  supabase: Supabase,
  chatId: string,
  subject: string,
  name: string | null,
  email: string | null,
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await supabase
    .from("support_threads").select("id, guest_email").eq("channel_ref", chatId).maybeSingle();

  if (existing) {
    // Backfill an email that only showed up later (e.g. in the transcript) so
    // staff replies can reach the visitor.
    if (email && !existing.guest_email) {
      await supabase.from("support_threads").update({ guest_email: email }).eq("id", existing.id);
    }
    return { id: existing.id as string, created: false };
  }

  const { data, error } = await supabase
    .from("support_threads")
    .insert({
      subject: subject.slice(0, 120),
      guest_name: name || "Live chat visitor",
      guest_email: email,
      channel: "chat",
      channel_ref: chatId,
    })
    .select("id").single();
  if (error) throw error;
  return { id: data.id as string, created: true };
}

async function insertUserMessage(supabase: Supabase, threadId: string, body: string) {
  await supabase.from("support_messages").insert({
    thread_id: threadId, sender_role: "user", sender_id: null, body,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!SECRET) return json({ error: "Webhook secret not configured" }, 500);

  const raw = await req.text();
  const ok = await validSignature(raw, req.headers.get("x-tawk-signature"));
  if (!ok) return json({ error: "Invalid signature" }, 401);

  let payload: Record<string, any>;
  try { payload = JSON.parse(raw); } catch { return json({ error: "Bad JSON" }, 400); }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const event = payload.event;

    if (event === "chat:start") {
      const chatId = String(payload.chatId ?? payload.chat?.id ?? "");
      if (!chatId) return json({ ok: true, ignored: "no chatId" });
      const visitor = payload.visitor ?? {};
      const text: string | undefined = payload.message?.text;
      const subject = text?.trim() ? text.trim() : `Live chat — ${visitor.name || "visitor"}`;

      const { id, created } = await getOrCreateThread(
        supabase, chatId, subject, visitor.name ?? null, visitor.email ?? null,
      );
      // Only post the opening message when the thread is new, so retries of the
      // same chat:start don't duplicate it.
      if (created && text?.trim()) await insertUserMessage(supabase, id, text.trim());
      return json({ ok: true, thread_id: id });
    }

    if (event === "chat:transcript_created") {
      const chat = payload.chat ?? {};
      const chatId = String(chat.id ?? payload.chatId ?? "");
      if (!chatId) return json({ ok: true, ignored: "no chatId" });
      const visitor = chat.visitor ?? payload.visitor ?? {};
      const messages: any[] = Array.isArray(chat.messages) ? chat.messages : [];
      const visitorMsgs = messages
        .filter((m) => (m?.sender?.type ?? "visitor") === "visitor" && typeof m?.text === "string" && m.text.trim())
        .map((m) => m.text.trim() as string);

      const subject = visitorMsgs[0]?.slice(0, 120) || `Live chat — ${visitor.name || "visitor"}`;
      const { id } = await getOrCreateThread(
        supabase, chatId, subject, visitor.name ?? null, visitor.email ?? null,
      );

      // Append only the visitor messages we haven't recorded yet (idempotent on
      // redelivery): count what's stored, insert the remaining tail.
      const { count } = await supabase
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", id)
        .eq("sender_role", "user");
      const already = count ?? 0;
      for (const text of visitorMsgs.slice(already)) {
        await insertUserMessage(supabase, id, text);
      }
      return json({ ok: true, thread_id: id, appended: Math.max(0, visitorMsgs.length - already) });
    }

    return json({ ok: true, ignored: event ?? "unknown" });
  } catch (e) {
    console.error("tawk-webhook", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
