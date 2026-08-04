// Reception AI (Elevenlabs / app.reception.ai) -> eFinMoney Support Inbox
//
// Configure this URL as the webhook target in Reception AI, and set the
// RECEPTION_WEBHOOK_SECRET secret to the same value you put in the
// "x-reception-secret" header there.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Json = Record<string, unknown>;

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function pick(obj: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("RECEPTION_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook not configured" }, 503);
  const provided =
    req.headers.get("x-reception-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (provided !== secret) return json({ error: "Unauthorized" }, 401);

  let payload: Json;
  try {
    payload = (await req.json()) as Json;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Reception AI nests the call under `data`/`call` on some event types.
  const data = (payload.data ?? payload.call ?? payload) as Json;
  const contact = (data.contact ?? data.caller ?? data.customer ?? {}) as Json;

  const externalRef =
    pick(data, ["id", "call_id", "conversation_id", "booking_id"]) ??
    pick(payload, ["id", "event_id"]);
  if (!externalRef) return json({ error: "Missing call/booking id" }, 400);

  const eventType = pick(payload, ["type", "event", "event_type"]) || "call";
  const email = (pick(contact, ["email"]) || pick(data, ["email", "caller_email"]))?.toLowerCase() ?? null;
  const phone = pick(contact, ["phone", "phone_number"]) || pick(data, ["phone", "from", "caller_number"]);
  const name = pick(contact, ["name", "full_name"]) || pick(data, ["name", "caller_name"]) || "Reception AI caller";
  const summary = pick(data, ["summary", "call_summary", "notes", "reason"]);
  const transcript = pick(data, ["transcript", "transcript_text"]);
  const callbackRequested = Boolean(
    data.callback_requested ?? data.needs_callback ?? /callback|call me back/i.test(summary ?? ""),
  );
  const subject =
    pick(data, ["subject", "topic", "title"]) ||
    (eventType.includes("book") ? "Booking via Reception AI" : "Call via Reception AI");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Match the caller to an existing account so the thread lands on their CRM record.
  let userId: string | null = null;
  if (email) {
    const { data: p } = await supabase
      .from("profiles").select("user_id").eq("email", email).maybeSingle();
    userId = (p as { user_id?: string } | null)?.user_id ?? null;
  }
  if (!userId && phone) {
    const { data: p } = await supabase
      .from("profiles").select("user_id").eq("phone", phone).maybeSingle();
    userId = (p as { user_id?: string } | null)?.user_id ?? null;
  }

  // One thread per Reception AI call, updated as follow-up events arrive.
  const { data: existing } = await supabase
    .from("support_threads")
    .select("id")
    .eq("external_source", "reception")
    .eq("external_ref", externalRef)
    .maybeSingle();

  const preview = (summary || transcript || subject).slice(0, 300);
  let threadId = (existing as { id?: string } | null)?.id ?? null;

  if (!threadId) {
    const { data: thread, error } = await supabase
      .from("support_threads")
      .insert({
        user_id: userId,
        guest_email: userId ? null : email,
        guest_name: userId ? null : name,
        subject,
        channel: "reception",
        status: "open",
        priority: callbackRequested ? "high" : "normal",
        unread_for_staff: true,
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
        external_source: "reception",
        external_ref: externalRef,
      })
      .select("id")
      .single();
    if (error) return json({ error: error.message }, 500);
    threadId = (thread as { id: string }).id;
  } else {
    await supabase
      .from("support_threads")
      .update({
        unread_for_staff: true,
        status: "open",
        last_message_preview: preview,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", threadId);
  }

  const lines = [
    `**${eventType}** from Reception AI`,
    name ? `Caller: ${name}` : null,
    email ? `Email: ${email}` : null,
    phone ? `Phone: ${phone}` : null,
    callbackRequested ? "Callback requested" : null,
    summary ? `\nSummary:\n${summary}` : null,
    transcript ? `\nTranscript:\n${transcript}` : null,
  ].filter(Boolean);

  const { error: mErr } = await supabase.from("support_messages").insert({
    thread_id: threadId,
    sender_role: "user",
    sender_id: userId,
    body: lines.join("\n"),
  });
  if (mErr) return json({ error: mErr.message }, 500);

  return json({ success: true, thread_id: threadId, matched_user: Boolean(userId) });
});
