#!/usr/bin/env node
/**
 * Elicate Pay v1 smoke test — auth + read-only / light probes.
 *
 *   node scripts/elicate-smoke-test.mjs
 * Put creds in scripts/.elicate.env (see .elicate.env.example).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, ".elicate.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const envRaw = (process.env.ELICATE_ENV || "").toLowerCase();
const isLive = ["live", "production", "prod", "1", "true"].includes(envRaw)
  || Boolean(process.env.ELICATE_LIVE_SECRET_KEY);
const host = (isLive
  ? (process.env.ELICATE_LIVE_BASE_URL || "https://elicatepay.vercel.app")
  : "https://elicatepay.vercel.app"
).replace(/\/+$/, "");
const secret = isLive
  ? process.env.ELICATE_LIVE_SECRET_KEY
  : process.env.ELICATE_SECRET_KEY;
const publicKey = isLive
  ? process.env.ELICATE_LIVE_PUBLIC_KEY
  : process.env.ELICATE_PUBLIC_KEY;

if (!secret) {
  console.error("Missing secret key. Copy scripts/.elicate.env.example → scripts/.elicate.env");
  process.exit(1);
}

const authHdr = {
  Authorization: `Bearer ${secret}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

async function hit(label, url, init) {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    const ok = res.ok && !json.error;
    console.log(`${ok ? "OK" : "FAIL"} ${label} [${res.status}] ${Date.now() - started}ms`);
    if (!ok) console.log("  ", JSON.stringify(json).slice(0, 300));
    return { ok, status: res.status, json };
  } catch (e) {
    console.log(`ERR ${label}:`, e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

console.log(`Elicate Pay v1 smoke (${isLive ? "live" : "sandbox"}) host=${host}\n`);

const results = [];
results.push(await hit("GET payment-links", `${host}/api/v1/payment-links`, {
  method: "GET",
  headers: authHdr,
}));

if (publicKey) {
  results.push(await hit("POST checkout/pay (expect validation)", `${host}/api/v1/checkout/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      public_key: publicKey,
      customer_name: "Smoke Test",
      phone: "0962000000",
      network: "MTN",
      amount: 1,
      reference: `SMOKE-${Date.now()}`,
    }),
  }));
} else {
  console.log("SKIP checkout/pay (no public key)");
}

const whSecret = isLive
  ? process.env.ELICATE_LIVE_WEBHOOK_SECRET
  : process.env.ELICATE_WEBHOOK_SECRET;
if (whSecret) {
  results.push(await hit("POST webhooks/test", `${host}/api/v1/webhooks/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://httpbin.org/post",
      secret: whSecret,
    }),
  }));
} else {
  console.log("SKIP webhooks/test (no webhook secret)");
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed.`);
process.exit(passed >= 1 ? 0 : 1);
