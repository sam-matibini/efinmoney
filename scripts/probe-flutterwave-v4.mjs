#!/usr/bin/env node
/**
 * Flutterwave V4 smoke probe (OAuth + MoMo charge create).
 *
 * Usage:
 *   node scripts/probe-flutterwave-v4.mjs
 *
 * Credentials: scripts/.flw-v4.env or project .env
 *   FLW_CLIENT_ID, FLW_CLIENT_SECRET
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
const BASE = (process.env.FLW_V4_BASE_URL || "https://f4bexperience.flutterwave.com").replace(/\/+$/, "");

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
    json = { raw: text };
  }
  return { status: res.status, json };
}

const corridors = [
  { ccy: "KES", cc: "254", net: "MPESA", phone: "712345678", amt: 10 },
  { ccy: "UGX", cc: "256", net: "MTN", phone: "770123456", amt: 500 },
  { ccy: "TZS", cc: "255", net: "VODAFONE", phone: "712345678", amt: 1000 },
  { ccy: "RWF", cc: "250", net: "MTN", phone: "780123456", amt: 500 },
];

console.log("Flutterwave V4 probe");
console.log("Base:", BASE);
console.log("Client ID:", CLIENT_ID.slice(0, 8) + "…");
console.log("");

const auth = await token();
console.log("OAuth: OK (token " + auth.slice(0, 18) + "…)\n");

for (const c of corridors) {
  const cus = await flw("/customers", {
    email: `probe-${c.ccy.toLowerCase()}@efin.money`,
    name: { first: "eFin", last: "Probe" },
    phone: { country_code: c.cc, number: c.phone },
  });
  const pm = await flw("/payment-methods", {
    type: "mobile_money",
    mobile_money: { country_code: c.cc, network: c.net, phone_number: c.phone },
  });
  if (cus.status >= 300 || pm.status >= 300) {
    console.log(
      `${c.ccy}: setup FAIL`,
      cus.json?.error?.message || cus.json?.message,
      "|",
      pm.json?.error?.message || pm.json?.message,
    );
    continue;
  }
  const ch = await flw("/charges", {
    currency: c.ccy,
    amount: c.amt,
    reference: randomUUID(),
    customer_id: cus.json.data.id,
    payment_method_id: pm.json.data.id,
    meta: { type: "corridor_probe" },
  });
  const msg = ch.json?.error?.message || ch.json?.message || `HTTP ${ch.status}`;
  const st = ch.json?.data?.status || "";
  const na = ch.json?.data?.next_action?.type || "";
  console.log(`${c.ccy}: charge ${ch.status} — ${msg} ${st} ${na}`.trim());
}

console.log("\nDone.");
