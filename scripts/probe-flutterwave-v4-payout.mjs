#!/usr/bin/env node
/**
 * Flutterwave V4 direct-transfers (payout) smoke probe.
 * Does NOT move real money if FLW rejects (IP whitelist / balance / validation).
 *
 * Usage: node scripts/probe-flutterwave-v4-payout.mjs
 * Dry-run only by default — set FLW_PAYOUT_LIVE=1 to attempt real tiny transfers.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(join(__dir, ".flw-v4.env"));
loadEnv(join(__dir, "..", ".env"));

const CLIENT_ID = (process.env.FLW_CLIENT_ID || "").trim();
const CLIENT_SECRET = (process.env.FLW_CLIENT_SECRET || "").trim();
// Prefer the same Cloudflare Worker used for V3 IP whitelisting when set.
const BASE = (
  process.env.FLW_V4_PROXY_URL ||
  process.env.FLW_PROXY_URL ||
  process.env.FLW_V4_BASE_URL ||
  "https://f4bexperience.flutterwave.com"
).replace(/\/+$/, "");
const LIVE = process.env.FLW_PAYOUT_LIVE === "1";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing FLW_CLIENT_ID / FLW_CLIENT_SECRET");
  process.exit(1);
}

async function token() {
  const res = await fetch(
    "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    },
  );
  const json = await res.json();
  if (!json.access_token) throw new Error(JSON.stringify(json));
  return json.access_token;
}

async function flw(path, body) {
  const t = await token();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      "X-Trace-Id": randomUUID(),
      "X-Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

function errMsg(json) {
  return (
    json?.message ||
    json?.error?.message ||
    json?.error ||
    json?.data?.message ||
    JSON.stringify(json).slice(0, 200)
  );
}

const corridors = [
  { currency: "KES", network: "MPS", msisdn: "254712345678", amount: 10, country: "KE" },
  { currency: "UGX", network: "MTN", msisdn: "256772123456", amount: 500, country: "UG" },
  { currency: "GHS", network: "MTN", msisdn: "233241234567", amount: 1, country: "GH" },
  { currency: "RWF", network: "MTN", msisdn: "250788123456", amount: 100, country: "RW" },
  { currency: "TZS", network: "AIRTEL", msisdn: "255712345678", amount: 1000, country: "TZ" },
  { currency: "ZMW", network: "MTN", msisdn: "260971234567", amount: 1, country: "ZM" },
];

console.log(`Base: ${BASE}`);
console.log(`Mode: ${LIVE ? "LIVE (will create transfers)" : "probe (same API call — FLW may still debit if accepted)"}`);
console.log("");

const results = [];
for (const c of corridors) {
  const reference = `efmpayout-probe-${c.currency.toLowerCase()}-${Date.now().toString(36)}`;
  const body = {
    action: "instant",
    type: "mobile_money",
    reference,
    narration: `eFin probe ${c.currency}`,
    payment_instruction: {
      source_currency: c.currency,
      destination_currency: c.currency,
      amount: { applies_to: "destination_currency", value: c.amount },
      recipient: {
        name: { first: "Probe", last: "Test" },
        mobile_money: { network: c.network, msisdn: c.msisdn, country: c.country },
      },
    },
    meta: { probe: true, currency: c.currency },
  };

  const { status, json } = await flw("/direct-transfers", body);
  const msg = errMsg(json);
  const ok = status >= 200 && status < 300 && (json.status === "success" || json.data?.id);
  const row = {
    currency: c.currency,
    network: c.network,
    http: status,
    ok: Boolean(ok),
    id: json?.data?.id || null,
    message: String(msg).slice(0, 160),
  };
  results.push(row);
  console.log(
    `${c.currency}/${c.network}: HTTP ${status} ${ok ? "OK" : "FAIL"} — ${row.message}`,
  );
}

console.log("\n--- summary ---");
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.currency} ${r.network}: ${r.message}`);
}
