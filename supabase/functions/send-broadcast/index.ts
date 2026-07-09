// Communication Hub sender: fan a broadcast out to the in-app notifications
// rail + optional Resend email. Called two ways:
//   { mode: "send", broadcast_id }  — admin "Send now" (staff JWT or internal secret)
//   { mode: "dispatch_due" }        — pg_cron picks up scheduled broadcasts (internal secret)
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const EMAIL_FROM = "eFinMoney <noreply@efinsuite.com>";
const UNSUB_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET") || SERVICE_KEY;

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function unsubToken(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(UNSUB_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function emailHtml(title: string, body: string, userId: string): Promise<string> {
  const token = await unsubToken(userId);
  const unsub = `${SUPABASE_URL}/functions/v1/unsubscribe?u=${userId}&t=${token}`;
  const bodyHtml = esc(body).replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
      <div style="background:#1a1440;padding:20px 28px;">
        <span style="color:#fff;font-size:20px;font-weight:800;">eFinMoney</span>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#1a1440;">${esc(title)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#3a3a3a;">${bodyHtml}</div>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9a9a9a;margin-top:20px;line-height:1.5;">
      You're receiving this because you have an eFinMoney account.<br>
      <a href="${unsub}" style="color:#9a9a9a;">Unsubscribe from announcements</a>
    </p>
  </div></body></html>`;
}

type Recipient = { user_id: string; email: string | null; email_opt_out: boolean };

async function resolveAudience(db: SupabaseClient, audience: Record<string, unknown>): Promise<Recipient[]> {
  const scope = String(audience?.scope || "all");
  const rows: Recipient[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = db.from("profiles")
      .select("user_id, email, email_opt_out")
      .not("user_id", "is", null)
      .range(from, from + pageSize - 1);

    if (scope === "users" && Array.isArray(audience.user_ids)) {
      q = q.in("user_id", audience.user_ids as string[]);
    } else if (scope === "segment") {
      const tiers = audience.kyc_tier as string[] | undefined;
      const statuses = audience.kyc_status as string[] | undefined;
      const countries = audience.country_code as string[] | undefined;
      if (tiers?.length) q = q.in("kyc_tier", tiers);
      if (statuses?.length) q = q.in("kyc_status", statuses);
      if (countries?.length) q = q.in("country_code", countries);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Recipient[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function sendEmails(recipients: Recipient[], title: string, body: string): Promise<Set<string>> {
  const emailed = new Set<string>();
  if (!RESEND_API_KEY) return emailed;
  const targets = recipients.filter((r) => r.email && !r.email_opt_out);
  for (const group of chunk(targets, 100)) {
    const payload = await Promise.all(group.map(async (r) => ({
      from: EMAIL_FROM,
      to: [r.email!],
      subject: title,
      html: await emailHtml(title, body, r.user_id),
    })));
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) group.forEach((r) => emailed.add(r.user_id));
      else console.error("Resend batch error", await res.text());
    } catch (e) {
      console.error("Resend batch threw", e);
    }
  }
  return emailed;
}

async function processBroadcast(db: SupabaseClient, id: string): Promise<Record<string, unknown>> {
  // Claim it: only draft/scheduled → sending (guards against double-send).
  const { data: claimed } = await db.from("broadcasts")
    .update({ status: "sending" })
    .eq("id", id).in("status", ["draft", "scheduled"])
    .select("*").maybeSingle();
  if (!claimed) return { id, skipped: "not_claimable" };

  try {
    const channels: string[] = claimed.channels ?? ["in_app"];
    const recipients = await resolveAudience(db, claimed.audience ?? { scope: "all" });

    // In-app fan-out
    const notifs = recipients.map((r) => ({
      user_id: r.user_id, title: claimed.title, message: claimed.body,
      type: "announcement", is_read: false,
    }));
    for (const c of chunk(notifs, 500)) {
      const { error } = await db.from("notifications").insert(c);
      if (error) throw new Error(`notifications insert: ${error.message}`);
    }

    // Email fan-out
    const emailed = channels.includes("email")
      ? await sendEmails(recipients, claimed.title, claimed.body)
      : new Set<string>();

    // Audit rows
    const audit = recipients.map((r) => ({
      broadcast_id: id, user_id: r.user_id,
      in_app_done: true, email_done: emailed.has(r.user_id),
    }));
    for (const c of chunk(audit, 500)) {
      await db.from("broadcast_recipients").upsert(c, { onConflict: "broadcast_id,user_id" });
    }

    await db.from("broadcasts").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: recipients.length,
      in_app_count: recipients.length,
      email_count: emailed.size,
      error: null,
    }).eq("id", id);

    return { id, recipients: recipients.length, emailed: emailed.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("broadcasts").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", id);
    return { id, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "dispatch_due" ? "dispatch_due" : "send";

    const isInternal = req.headers.get("x-internal-secret") === SERVICE_KEY;

    // Auth: dispatch_due is cron-only; send allows staff JWT or internal secret.
    if (mode === "dispatch_due") {
      if (!isInternal) return json({ error: "Forbidden" }, 403);
    } else if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await asUser.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return json({ error: "Unauthorized" }, 401);
      const { data: roles } = await asUser.from("user_roles").select("role").eq("user_id", user.id);
      const isStaff = (roles ?? []).some((r: { role: string }) => ["admin", "finance", "compliance"].includes(r.role));
      if (!isStaff) return json({ error: "Forbidden" }, 403);
    }

    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    if (mode === "dispatch_due") {
      const { data: due } = await db.from("broadcasts")
        .select("id").eq("status", "scheduled").lte("scheduled_at", new Date().toISOString()).limit(50);
      const results = [];
      for (const b of due ?? []) results.push(await processBroadcast(db, b.id));
      return json({ ok: true, dispatched: results.length, results });
    }

    if (!body?.broadcast_id) return json({ error: "broadcast_id required" }, 400);
    const result = await processBroadcast(db, String(body.broadcast_id));
    return json({ ok: true, ...result });
  } catch (e) {
    console.error("send-broadcast", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
