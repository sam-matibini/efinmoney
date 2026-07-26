#!/usr/bin/env node
/**
 * Probe Lenhub EfinMoney API (efincash.lenhub.net)
 *
 * Loads scripts/.lenhub.env when present.
 * Usage:
 *   node scripts/probe-lenhub-flutter.mjs
 * Optional live card (charges real money — tiny amount):
 *   LENHUB_CARD_NUMBER=... LENHUB_CARD_EXP_MONTH=09 LENHUB_CARD_EXP_YEAR=32 LENHUB_CARD_CVV=... \
 *   LENHUB_CARD_CURRENCY=USD LENHUB_CARD_AMOUNT=1 node scripts/probe-lenhub-flutter.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, ".lenhub.env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const BASE = (process.env.LENHUB_FLUTTER_API_URL || "https://efincash.lenhub.net").replace(/\/+$/, "");
const PREFIX = "/v1/flutterwave/flutter";
const API_KEY = (process.env.LENHUB_FLUTTER_USER_KEY || process.env.LENHUB_FLUTTER_API_KEY || "").trim();
const CB = "https://efin-flw-proxy.ukwenzyb.workers.dev/webhooks/lenhub-flutter";

if (!API_KEY) {
  console.error("Missing LENHUB_FLUTTER_USER_KEY — set in scripts/.lenhub.env");
  process.exit(1);
}

async function hit(method, path, { query = {}, body, sessionKey } = {}) {
  const u = new URL(path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? "" : "/"}${path}`);
  const q = { ...query };
  if (sessionKey) q.user_key = sessionKey;
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const init = { method, headers: { Accept: "application/json" } };
  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(sessionKey ? { ...body, user_key: sessionKey } : body);
  }
  const res = await fetch(u, init);
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, raw: text };
}

async function auth() {
  const { status, json } = await hit("POST", "/v1/flutterwave/auth/user_api/", {
    body: { user_key: API_KEY },
  });
  const key = json?.key ? String(json.key) : null;
  return { status, key, json };
}

function isUnauthorized(status, json) {
  return status === 401 || json?.status === 401 || String(json?.message || "").toLowerCase() === "unauthorized";
}

/** Fresh session per attempt; Fernet user_key expires / flakes quickly. */
async function withSession(label, fn, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const { key } = await auth();
    if (!key) {
      console.log(`${label}: auth failed try ${i}`);
      continue;
    }
    const result = await fn(key);
    if (!isUnauthorized(result.status, result.json)) return result;
    console.log(`${label}: unauthorized try ${i}/${attempts}, refreshing session…`);
  }
  return { status: 401, json: { message: "Unauthorized after retries" } };
}

function summarize(json, n = 220) {
  const s = JSON.stringify(json);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function fxData(json) {
  return json?.message?.status?.data || json?.message?.data || null;
}

function pickChargeId(json) {
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const f = walk(item);
        if (f) return f;
      }
      return null;
    }
    for (const k of ["chargeId", "charge_id", "id"]) {
      if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
    }
    for (const nest of ["message", "data", "status", "payment", "charge"]) {
      if (obj[nest]) {
        const f = walk(obj[nest]);
        if (f) return f;
      }
    }
    return null;
  };
  return walk(json);
}

function pickType(json) {
  const msg = json?.message;
  if (Array.isArray(msg) && msg[0]?.type) return String(msg[0].type);
  return null;
}

console.log(`Base: ${BASE}`);
console.log(`API key: ${API_KEY.slice(0, 6)}…${API_KEY.slice(-4)}\n`);

const { status: authStatus, key: sessionKey, json: authJson } = await auth();
if (!sessionKey) {
  console.error("Auth failed", authStatus, summarize(authJson));
  process.exit(1);
}
console.log(`Auth: HTTP ${authStatus} session ok\n`);

// --- FX (USD→CAD claim) ---
console.log("=== FX (USD / CAD) ===");
for (const [s, d] of [
  ["USD", "CAD"],
  ["CAD", "USD"],
  ["USD", "NGN"],
  ["CAD", "NGN"],
  ["USD", "GHS"],
]) {
  const { status, json } = await withSession(`FX ${s}->${d}`, (key) =>
    hit("POST", `${PREFIX}/exchange/rate/`, {
      query: { source_currency: s, destination_currency: d, amount: 10 },
      sessionKey: key,
    }),
  );
  const data = fxData(json);
  if (data?.rate) {
    console.log(`FX ${s}->${d}: OK rate=${data.rate} src=${JSON.stringify(data.source)} dst=${JSON.stringify(data.destination)}`);
  } else {
    console.log(`FX ${s}->${d}: HTTP ${status} FAIL ${summarize(json)}`);
  }
}

// --- Banks ---
console.log("\n=== Banks ===");
{
  const { status, json } = await withSession("banks NG", (key) =>
    hit("GET", `${PREFIX}/bank/code/`, { query: { country_code: "NG" }, sessionKey: key }),
  );
  const data = json?.message?.data || json?.data;
  console.log(`banks NG: HTTP ${status} count=${Array.isArray(data) ? data.length : 0}`);
}

// --- Verify (new path) ---
console.log("\n=== Verify bank_account ===");
{
  const { status, json } = await withSession("verify", (key) =>
    hit("POST", `${PREFIX}/verify/bank_account/`, {
      body: { bank_code: "044", account_number: "0690000031", currency: "NGN" },
      sessionKey: key,
    }),
  );
  console.log(`verify: HTTP ${status} ${summarize(json)}`);
}

// --- Networks GET ---
console.log("\n=== MoMo networks ===");
for (const c of ["GH", "KE", "UG"]) {
  const { status, json } = await withSession(`networks ${c}`, (key) =>
    hit("GET", `${PREFIX}/check/mobile/networks/`, { query: { country: c }, sessionKey: key }),
  );
  const data = json?.message?.data || json?.data;
  const nets = Array.isArray(data) ? data.map((n) => n.network || n.name).filter(Boolean).join(",") : summarize(json);
  console.log(`networks ${c}: HTTP ${status} ${nets}`);
}

// --- VA ---
console.log("\n=== Virtual account ===");
{
  const { status, json } = await withSession("VA", (key) =>
    hit("POST", `${PREFIX}/create/virtual/account/`, {
      body: { amount: 100, email: "probe@efin.money" },
      sessionKey: key,
    }),
  );
  const data = json?.message?.status?.data || json?.message?.data;
  if (data?.account_number) {
    console.log(`VA: OK ${data.account_bank_name} ${data.account_number} amount=${data.amount}`);
  } else {
    console.log(`VA: HTTP ${status} ${summarize(json)}`);
  }
}

// --- Card collect USD / CAD (FLW test Visa — may require additional_fields) ---
console.log("\n=== Card collect (test PAN) ===");
const testPan = process.env.LENHUB_CARD_NUMBER?.replace(/\s+/g, "") || "4242424242424242";
for (const cur of ["USD", "CAD", "NGN"]) {
  const amount = cur === "NGN" ? 100 : Number(process.env.LENHUB_CARD_AMOUNT || 1);
  const { status, json } = await withSession(`card ${cur}`, (key) =>
    hit("POST", `${PREFIX}/card/payment/create/`, {
      body: {
        card_number: testPan,
        expiry_date_month: String(process.env.LENHUB_CARD_EXP_MONTH || "09").padStart(2, "0"),
        expiry_date_year: String(process.env.LENHUB_CARD_EXP_YEAR || "32").slice(-2),
        cvv: String(process.env.LENHUB_CARD_CVV || "564"),
        amount,
        callback: CB,
        email: process.env.LENHUB_CARD_EMAIL || "probe@efin.money",
        currency: cur,
      },
      sessionKey: key,
    }),
  );
  const empty = Array.isArray(json?.message) && json.message.length === 0;
  console.log(
    `card ${cur}: HTTP ${status} chargeId=${pickChargeId(json) || "-"} type=${pickType(json) || (empty ? "empty_message[]" : "-")} ${empty ? "" : summarize(json, 160)}`,
  );
}

// --- Path existence (no live payout) ---
console.log("\n=== Route smoke (expect validation/balance errors, not 404) ===");
{
  const { status, json } = await withSession("payout/nigeria", (key) =>
    hit("POST", `${PREFIX}/payout/exchange/nigeria`, {
      body: {
        amount: 1,
        bank_code: "044",
        account_number: "0690000031",
        source_currency: "USD",
        callback_url: CB,
        narration: "efin-route-smoke-no-pay",
      },
      sessionKey: key,
    }),
  );
  const is404 = status === 404 || /Page not found/i.test(String(json?.raw || ""));
  console.log(`payout/nigeria: HTTP ${status} ${is404 ? "MISSING_ROUTE" : "route_alive"} ${summarize(json, 160)}`);
}

console.log("\nDone. No git commit performed.");
