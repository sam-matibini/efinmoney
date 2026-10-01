import https from "node:https";
import { geminiKeyCandidates, looksLikeGeminiApiKey, redactGeminiSecret } from "../src/lib/geminiKeyShape.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://dkdnwumllibwdlqbjkwy.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrZG53dW1sbGlid2RscWJqa3d5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjE5MTIsImV4cCI6MjA3NzU5NzkxMn0.DxMKTL99wjiBUkqUZGfuDtYHFEQFHs9qJqlSJYLmKAk";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const REFERRERS = ["https://www.efin.money/", "https://efin.money/"];

const SYSTEM = `You are Alice, the EfinMoney in-app assistant.
Only help with EfinMoney. Be concise and friendly.
Do not invent balances, fees, limits, or transaction details.
You are read-only and cannot send money or change an account.
Send money from the Send page. Nigeria payouts can go to mobile money or a bank account, depending on the recipient.
Add money from Top up. Exchange currency from the wallet. Verification is on the identity page.
If you are unsure, say so and point the user to the page or to support.`;

function send(res, status, payload) {
  res.status(status).json(payload);
}

async function supabaseGet(path, token) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function postGemini(apiKey, model, payload, referer) {
  const body = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...(referer ? { referer } : {}),
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {};
        }
        resolve({ status: response.statusCode || 0, body: parsed });
      });
    });
    req.on("error", () => resolve({ status: 0, body: {} }));
    req.write(body);
    req.end();
  });
}

function readReply(result) {
  const text = result.body?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (result.status >= 200 && result.status < 300 && text) return { reply: text };
  const message = String(result.body?.error?.message || "");
  const reason = String(result.body?.error?.details?.find((detail) => detail?.reason)?.reason || "");
  const rejected = /api key not valid|API_KEY_INVALID|API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_SERVICE_BLOCKED|permission denied/i.test(`${message} ${reason}`);
  return { rejected, error: redactGeminiSecret(message || reason || "Gemini did not answer.") };
}

async function settlementFacts(token, messages) {
  const latest = [...messages].reverse().find((message) => message?.role === "user")?.content || "";
  if (!/settlement|reconcil/i.test(latest)) return "";
  const result = await supabaseGet("/rest/v1/settlement_reconciliations?select=status,variance_amount&limit=1000", token);
  if (!result.ok || !Array.isArray(result.body)) return "";
  const byStatus = {};
  let totalVariance = 0;
  for (const row of result.body) {
    const status = row.status || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
    totalVariance += Number(row.variance_amount || 0);
  }
  const summary = { total: result.body.length, by_status: byStatus, total_variance: Math.round(totalVariance * 100) / 100 };
  return `\nStaff settlement reconciliation data (use these figures only): ${JSON.stringify(summary)}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return send(res, 401, { error: "Unauthorized" });
  const user = await supabaseGet("/auth/v1/user", token);
  if (!user.ok || !user.body?.id) return send(res, 401, { error: "Unauthorized" });

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const settings = await supabaseGet("/rest/v1/integration_settings?select=key,is_enabled,config&key=like.system_api:%25", token);
  if (!settings.ok) {
    const message = String(settings.body?.message || settings.body?.error || "");
    if (/permission denied|row-level security/i.test(message)) {
      return send(res, 403, { error: "Alice cannot read the saved Gemini key from this account." });
    }
    return send(res, 502, { error: "Alice could not read the saved Gemini key." });
  }
  const candidates = geminiKeyCandidates(settings.body);
  if (!candidates.length) {
    return send(res, 400, { error: "The value saved on the Gemini card is not a Google API key. Copy the key from Google AI Studio — it starts with AIza — and save it again." });
  }

  const contents = messages
    .slice(-16)
    .filter((message) => message?.role === "user" || message?.role === "assistant")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content || "") }],
    }));
  while (contents.length && contents[0].role !== "user") contents.shift();
  const system = `${SYSTEM}${await settlementFacts(token, messages)}`;
  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { maxOutputTokens: 1024 },
  };

  let lastError = "Gemini did not answer.";
  for (const saved of candidates) {
    let keyRejected = false;
    const models = [saved.model, ...MODELS].filter((model, index, all) => model && all.indexOf(model) === index);
    for (const model of models) {
      if (keyRejected) break;
      for (const referer of [undefined, ...REFERRERS]) {
        const result = readReply(await postGemini(saved.apiKey, model, payload, referer));
        if (result.reply) return send(res, 200, { reply: result.reply });
        if (result.rejected) {
          keyRejected = true;
          lastError = looksLikeGeminiApiKey(saved.apiKey)
            ? "Google rejected the saved Gemini key. In Google AI Studio, create an API key with no website restriction, then save it on the Gemini card."
            : "The value saved on the Gemini card is not a Google API key. Copy the key from Google AI Studio — it starts with AIza — and save it again.";
          continue;
        }
        if (result.error && !/not found|not supported/i.test(result.error)) lastError = result.error;
        break;
      }
    }
  }
  return send(res, 502, { error: lastError });
}
