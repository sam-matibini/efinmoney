// Alice daily FX email: live rates + movement vs yesterday, each client's own corridors
// first, an AI-written intro and tip from Alice, an optional staff promo, and a CTA.
//
//   { mode: "run" }      pg_cron (x-internal-secret). Sends once per day at 08:00 Toronto.
//   { mode: "run", force: true }  internal only: skip the 08:00 check (still once per day).
//   { mode: "preview" }  staff JWT: returns { subject, html } personalised for the caller.
//   { mode: "test" }     staff JWT: sends today's email to the caller only.
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
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const UNSUB_SECRET = Deno.env.get("UNSUBSCRIBE_SECRET") || SERVICE_KEY;
const APP_URL = (Deno.env.get("APP_URL") || "https://www.efin.money").replace(/\/+$/, "");
const EMAIL_FROM = "Alice at eFinMoney <noreply@efinsuite.com>";
const MODEL = "claude-sonnet-5";
const TZ = "America/Toronto";
const SEND_HOUR = 8;

const KEY_PAIRS = ["CAD/NGN", "CAD/KES", "CAD/GHS", "CAD/USD", "USD/NGN", "GBP/NGN", "CAD/ZMW", "CAD/UGX", "USD/KES"];
const MAX_KEY_RATES = 6;
const MAX_PERSONAL = 3;

const FALLBACK_TIPS: { title: string; body: string }[] = [
  { title: "Save your favourite recipients", body: "Add family and friends to Contacts so your next transfer takes seconds." },
  { title: "Exchange between your wallets", body: "Convert CAD to USD or USDT in-app at the live rate, any time." },
  { title: "Request money with a link", body: "Create a payment link and share it. They can pay by bank or mobile money." },
  { title: "Track every transfer", body: "Open any transfer to see exactly where your money is, step by step." },
  { title: "Turn on hide balances", body: "Tap the eye icon on your dashboard to hide balances when you're in public." },
  { title: "Set a monthly budget", body: "Set a sending budget on your dashboard and watch your progress through the month." },
  { title: "Ask Alice anything", body: "Alice can check your balances, recent activity, verification status and live rates." },
];

type Rate = { pair: string; from: string; to: string; current: number; yesterday: number | null; weekHigh: number };
type Recipient = { user_id: string; email: string; first_name: string };
type Copy = { subject: string; intro: string; tipTitle: string; tipBody: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function torontoParts(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const prettyDate = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(new Date());

function fmtRate(n: number) {
  const digits = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const pct = (r: Rate) => (r.yesterday ? ((r.current - r.yesterday) / r.yesterday) * 100 : 0);
const isWeekBest = (r: Rate) => r.current >= r.weekHigh * 0.9995 && pct(r) > 0;

async function unsubToken(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(UNSUB_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ── data ────────────────────────────────────────────────────────────────────
async function loadRates(db: SupabaseClient): Promise<Map<string, Rate>> {
  const now = Date.now();
  const since = new Date(now - 8 * 86400_000).toISOString();
  const dayAgo = now - 86400_000;
  const weekAgo = now - 7 * 86400_000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await db.from("fx_rates")
      .select("from_currency, to_currency, rate, effective_rate, valid_from, valid_until")
      .gte("valid_from", since)
      .order("valid_from", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(`fx_rates: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }

  const out = new Map<string, Rate>();
  for (const r of rows) {
    const pair = `${r.from_currency}/${r.to_currency}`;
    if (r.from_currency === r.to_currency) continue;
    const value = Number(r.effective_rate) > 0 ? Number(r.effective_rate) : Number(r.rate);
    if (!(value > 0)) continue;
    const ts = new Date(String(r.valid_from)).getTime();
    let entry = out.get(pair);
    if (!entry) {
      const validUntil = r.valid_until ? new Date(String(r.valid_until)).getTime() : Infinity;
      if (validUntil < now) continue;
      entry = { pair, from: String(r.from_currency), to: String(r.to_currency), current: value, yesterday: null, weekHigh: value };
      out.set(pair, entry);
    }
    if (ts >= weekAgo) entry.weekHigh = Math.max(entry.weekHigh, value);
    if (entry.yesterday === null && ts <= dayAgo) entry.yesterday = value;
  }
  return out;
}

async function loadRecipients(db: SupabaseClient, onlyUserId?: string): Promise<Recipient[]> {
  const out: Recipient[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("profiles")
      .select("user_id, email, full_name, email_opt_out")
      .not("user_id", "is", null)
      .not("email", "is", null)
      .range(from, from + 999);
    if (onlyUserId) q = q.eq("user_id", onlyUserId);
    else q = q.eq("email_opt_out", false);
    const { data, error } = await q;
    if (error) throw new Error(`profiles: ${error.message}`);
    for (const p of data ?? []) {
      const email = String(p.email || "").trim();
      if (!email.includes("@")) continue;
      const first = String(p.full_name || "").trim().split(/\s+/)[0] || "there";
      out.push({ user_id: p.user_id, email, first_name: first });
    }
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** user_id → that user's corridors, most-used first. */
async function loadCorridors(db: SupabaseClient, onlyUserId?: string): Promise<Map<string, string[]>> {
  const since = new Date(Date.now() - 180 * 86400_000).toISOString();
  const counts = new Map<string, Map<string, number>>();
  for (let from = 0; from < 50000; from += 1000) {
    let q = db.from("transfers")
      .select("sender_id, source_currency, target_currency")
      .gte("created_at", since)
      .range(from, from + 999);
    if (onlyUserId) q = q.eq("sender_id", onlyUserId);
    const { data, error } = await q;
    if (error) throw new Error(`transfers: ${error.message}`);
    for (const t of data ?? []) {
      if (!t.sender_id || !t.source_currency || !t.target_currency || t.source_currency === t.target_currency) continue;
      const pair = `${String(t.source_currency).toUpperCase()}/${String(t.target_currency).toUpperCase()}`;
      const m = counts.get(t.sender_id) ?? new Map<string, number>();
      m.set(pair, (m.get(pair) ?? 0) + 1);
      counts.set(t.sender_id, m);
    }
    if ((data ?? []).length < 1000) break;
  }
  const out = new Map<string, string[]>();
  for (const [uid, m] of counts) out.set(uid, [...m.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p));
  return out;
}

function pickKeyRates(rates: Map<string, Rate>): Rate[] {
  const picked = KEY_PAIRS.map((p) => rates.get(p)).filter((r): r is Rate => !!r);
  if (picked.length < MAX_KEY_RATES) {
    for (const r of rates.values()) {
      if (picked.length >= MAX_KEY_RATES) break;
      if (!picked.includes(r) && (r.from === "CAD" || r.from === "USD")) picked.push(r);
    }
  }
  return picked.slice(0, MAX_KEY_RATES);
}

// ── Alice copy ──────────────────────────────────────────────────────────────
function fallbackCopy(keyRates: Rate[]): Copy {
  const tip = FALLBACK_TIPS[new Date().getUTCDate() % FALLBACK_TIPS.length];
  const mover = [...keyRates].sort((a, b) => Math.abs(pct(b)) - Math.abs(pct(a)))[0];
  const moverLine = mover && mover.yesterday
    ? ` ${mover.pair} is ${pct(mover) >= 0 ? "up" : "down"} ${Math.abs(pct(mover)).toFixed(2)}% since yesterday.`
    : "";
  return {
    subject: mover ? `Today's rates: ${mover.pair} at ${fmtRate(mover.current)}` : "Your daily exchange rates",
    intro: `Here are today's live eFinMoney rates.${moverLine}`,
    tipTitle: tip.title,
    tipBody: tip.body,
  };
}

async function aliceCopy(keyRates: Rate[], promo: string | null): Promise<Copy> {
  const fallback = fallbackCopy(keyRates);
  if (!ANTHROPIC_API_KEY || keyRates.length === 0) return fallback;
  const facts = keyRates.map((r) => ({
    pair: r.pair,
    rate: fmtRate(r.current),
    change_vs_yesterday_pct: r.yesterday ? Number(pct(r).toFixed(2)) : null,
    best_this_week: isWeekBest(r),
  }));
  const prompt = [
    "You are Alice, the friendly assistant at eFinMoney, a Canadian money transfer app (CAD, USD and African corridors).",
    "Write today's short daily rates email for all clients. Today is " + prettyDate() + ".",
    "Live rates (customer rate = units of the second currency per 1 of the first):",
    JSON.stringify(facts),
    promo ? `Staff promo to weave in lightly if natural (do not invent offers): ${promo}` : "",
    "Rules: warm, upbeat, plain English. Only use the numbers given above; never invent rates, fees or offers.",
    "No financial advice, no predictions, no urgency pressure. Rates are indicative.",
    "Reply with ONLY a JSON object: {\"subject\": string (max 60 chars, may include one pair and its rate),",
    "\"intro\": string (2 sentences, max 45 words, mention the biggest mover),",
    "\"tip_title\": string (max 6 words), \"tip_body\": string (1 sentence, max 25 words, a genuinely useful eFinMoney feature tip:",
    "contacts, wallet exchange, payment links, transfer tracking, hide balances, monthly budget, or asking Alice)}.",
  ].filter(Boolean).join("\n");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const text: string = (data?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON in reply");
    const parsed = JSON.parse(match[0]);
    const clean = (v: unknown, max: number, fb: string) => {
      const s = String(v ?? "").replace(/\s+/g, " ").trim();
      return s ? s.slice(0, max) : fb;
    };
    return {
      subject: clean(parsed.subject, 80, fallback.subject),
      intro: clean(parsed.intro, 400, fallback.intro),
      tipTitle: clean(parsed.tip_title, 60, fallback.tipTitle),
      tipBody: clean(parsed.tip_body, 220, fallback.tipBody),
    };
  } catch (e) {
    console.error("alice copy fallback:", e instanceof Error ? e.message : e);
    return fallback;
  }
}

// ── email ───────────────────────────────────────────────────────────────────
function rateRow(r: Rate): string {
  const change = pct(r);
  const hasChange = r.yesterday !== null && Math.abs(change) >= 0.005;
  const color = !hasChange ? "#8ca7d0" : change > 0 ? "#16a34a" : "#dc2626";
  const arrow = !hasChange ? "&#8212;" : change > 0 ? "&#9650;" : "&#9660;";
  const changeText = hasChange ? `${arrow} ${Math.abs(change).toFixed(2)}%` : `${arrow} flat`;
  const best = isWeekBest(r)
    ? `<span style="display:inline-block;margin-left:6px;padding:2px 6px;border-radius:999px;background:#fff4dd;color:#b26a00;font-size:10px;font-weight:700;">BEST THIS WEEK</span>`
    : "";
  return `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #eef2f8;font-size:14px;font-weight:600;color:#0a1628;">${esc(r.from)} &rarr; ${esc(r.to)}${best}</td>
    <td style="padding:12px 0;border-bottom:1px solid #eef2f8;font-size:15px;font-weight:700;color:#0a1628;text-align:right;font-variant-numeric:tabular-nums;">${fmtRate(r.current)}</td>
    <td style="padding:12px 0 12px 12px;border-bottom:1px solid #eef2f8;font-size:12px;font-weight:600;color:${color};text-align:right;white-space:nowrap;">${changeText}</td>
  </tr>`;
}

function rateTable(title: string, rates: Rate[]): string {
  if (rates.length === 0) return "";
  return `<h2 style="margin:24px 0 4px;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#5b6b85;">${esc(title)}</h2>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rates.map(rateRow).join("")}</table>`;
}

async function buildEmail(
  r: Recipient,
  copy: Copy,
  personal: Rate[],
  keyRates: Rate[],
  promo: { text: string | null; url: string | null },
): Promise<string> {
  const token = await unsubToken(r.user_id);
  const unsub = `${SUPABASE_URL}/functions/v1/unsubscribe?u=${r.user_id}&t=${token}`;
  const ctaPair = personal[0] ?? keyRates[0];
  const ctaUrl = ctaPair
    ? `${APP_URL}/send?from=${encodeURIComponent(ctaPair.from)}&utm_source=alice_daily&utm_medium=email`
    : `${APP_URL}/send?utm_source=alice_daily&utm_medium=email`;
  const others = keyRates.filter((k) => !personal.some((p) => p.pair === k.pair));
  const promoHtml = promo.text
    ? `<div style="margin-top:20px;padding:14px 16px;border-radius:12px;background:#fff8ea;border:1px solid #f5d79a;font-size:14px;color:#5a3d00;">
        ${esc(promo.text)}${promo.url ? ` <a href="${esc(promo.url)}" style="color:#b26a00;font-weight:700;">Learn more</a>` : ""}
      </div>`
    : "";

  return `<!doctype html><html><body style="margin:0;background:#eef2f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(copy.intro)}</div>
  <div style="max-width:560px;margin:0 auto;padding:28px 16px;">
    <div style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(15,31,61,.08);">
      <div style="background:#0a1628;padding:20px 28px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
          <td><img src="${APP_URL}/email-logo.png" alt="eFinMoney" height="32" style="display:block;height:32px;"></td>
          <td style="text-align:right;color:#8ca7d0;font-size:12px;">${esc(prettyDate())}</td>
        </tr></table>
      </div>
      <div style="height:3px;background:#f5a623;"></div>
      <div style="padding:28px;">
        <p style="margin:0 0 6px;font-size:13px;color:#5b6b85;">Good morning, ${esc(r.first_name)}</p>
        <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#0a1628;">Your daily rates from Alice</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:#334155;">${esc(copy.intro)}</p>
        ${rateTable("Your corridors", personal)}
        ${rateTable(personal.length ? "More live rates" : "Today's live rates", others)}
        <p style="margin:10px 0 0;font-size:11px;color:#8a97ad;">Indicative customer rates at send time. Your exact rate and fees are shown before you confirm.</p>
        <div style="text-align:center;margin:26px 0 6px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#f5a623;color:#0a1628;text-decoration:none;font-weight:800;font-size:15px;padding:13px 28px;border-radius:12px;">Send money now</a>
        </div>
        ${promoHtml}
        <div style="margin-top:24px;padding:16px;border-radius:12px;background:#f4f7fc;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#0284c7;">Tip of the day</p>
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0a1628;">${esc(copy.tipTitle)}</p>
          <p style="margin:0;font-size:14px;line-height:1.5;color:#334155;">${esc(copy.tipBody)}</p>
        </div>
        <p style="margin:22px 0 0;font-size:14px;color:#334155;">Questions? Just ask me in the app.<br><strong>Alice</strong>, eFinMoney assistant</p>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#8a97ad;margin-top:18px;line-height:1.6;">
      You're receiving this daily update because you have an eFinMoney account.<br>
      <a href="${unsub}" style="color:#8a97ad;">Unsubscribe from marketing emails</a>
    </p>
  </div></body></html>`;
}

async function sendBatch(messages: { to: string; subject: string; html: string; userId: string }[]): Promise<number> {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  let sent = 0;
  for (const group of chunk(messages, 100)) {
    const payload = await Promise.all(group.map(async (m) => ({
      from: EMAIL_FROM,
      to: [m.to],
      subject: m.subject,
      html: m.html,
      headers: {
        "List-Unsubscribe": `<${SUPABASE_URL}/functions/v1/unsubscribe?u=${m.userId}&t=${await unsubToken(m.userId)}>`,
      },
    })));
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify(payload),
    });
    if (res.ok) sent += group.length;
    else console.error("Resend batch error", res.status, (await res.text()).slice(0, 300));
    await sleep(600);
  }
  return sent;
}

// ── orchestration ───────────────────────────────────────────────────────────
async function compose(db: SupabaseClient, onlyUserId?: string) {
  const { data: settings } = await db.from("daily_fx_email_settings").select("*").eq("id", true).maybeSingle();
  const rates = await loadRates(db);
  if (rates.size === 0) throw new Error("No live rates available");
  const keyRates = pickKeyRates(rates);
  const promo = { text: settings?.promo_text?.trim() || null, url: settings?.promo_url?.trim() || null };
  const copy = await aliceCopy(keyRates, promo.text);
  const [recipients, corridors] = await Promise.all([loadRecipients(db, onlyUserId), loadCorridors(db, onlyUserId)]);

  const build = async (r: Recipient) => {
    const personal = (corridors.get(r.user_id) ?? [])
      .map((p) => rates.get(p))
      .filter((x): x is Rate => !!x)
      .slice(0, MAX_PERSONAL);
    return { to: r.email, subject: copy.subject, html: await buildEmail(r, copy, personal, keyRates, promo), userId: r.user_id };
  };
  return { settings, copy, recipients, build };
}

async function runDaily(db: SupabaseClient, force: boolean) {
  const { date, hour } = torontoParts();
  if (!force && hour !== SEND_HOUR) return { skipped: `not ${SEND_HOUR}:00 in Toronto (hour ${hour})` };

  const { data: settings } = await db.from("daily_fx_email_settings").select("enabled").eq("id", true).maybeSingle();
  if (!settings?.enabled) return { skipped: "disabled" };

  const { data: run, error: claimErr } = await db.from("daily_fx_email_runs")
    .insert({ send_date: date, kind: "daily", status: "sending" })
    .select("id").single();
  if (claimErr || !run) return { skipped: "already sent today" };

  try {
    const { copy, recipients, build } = await compose(db);
    const messages = [];
    for (const r of recipients) messages.push(await build(r));
    const sent = await sendBatch(messages);
    await db.from("daily_fx_email_runs").update({
      status: "sent", subject: copy.subject, intro: copy.intro, tip: `${copy.tipTitle}: ${copy.tipBody}`,
      recipient_count: recipients.length, email_count: sent, finished_at: new Date().toISOString(),
    }).eq("id", run.id);
    return { sent, recipients: recipients.length, subject: copy.subject };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("daily_fx_email_runs").update({ status: "failed", error: msg.slice(0, 500), finished_at: new Date().toISOString() }).eq("id", run.id);
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "run");
    const isInternal = req.headers.get("x-internal-secret") === SERVICE_KEY;
    const db = createClient(SUPABASE_URL, SERVICE_KEY);

    if (mode === "run") {
      if (!isInternal) return json({ error: "Forbidden" }, 403);
      return json({ ok: true, ...(await runDaily(db, body?.force === true)) });
    }

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
    const isStaff = (roles ?? []).some((r: { role: string }) => ["admin", "finance", "compliance"].includes(r.role));
    if (!isStaff) return json({ error: "Forbidden" }, 403);

    const { copy, recipients, build } = await compose(db, user.id);
    const me = recipients[0] ?? { user_id: user.id, email: user.email ?? "", first_name: "there" };
    const message = await build(me);

    if (mode === "preview") return json({ ok: true, subject: copy.subject, html: message.html });

    if (mode === "test") {
      if (!me.email) return json({ error: "Your account has no email address" }, 400);
      const sent = await sendBatch([{ ...message, subject: `[Test] ${message.subject}` }]);
      await db.from("daily_fx_email_runs").insert({
        send_date: torontoParts().date, kind: "test", status: sent ? "sent" : "failed",
        subject: copy.subject, intro: copy.intro, tip: `${copy.tipTitle}: ${copy.tipBody}`,
        recipient_count: 1, email_count: sent, triggered_by: user.id, finished_at: new Date().toISOString(),
      });
      return json({ ok: sent > 0, sent_to: me.email, subject: copy.subject });
    }

    return json({ error: `unknown mode ${mode}` }, 400);
  } catch (e) {
    console.error("alice-daily-fx", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
