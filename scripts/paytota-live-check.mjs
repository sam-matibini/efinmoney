#!/usr/bin/env node
/**
 * Probe whether a Paytota secret+brand pair is live or test.
 * Usage: node scripts/paytota-live-check.mjs
 * Optional env: PAYTOTA_SECRET_KEY PAYTOTA_BRAND_ID
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, ".paytota.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

// Allow CLI override without printing secrets
const BASE = (process.env.PAYTOTA_BASE_URL || "https://gate.paytota.com").replace(/\/+$/, "");
const SECRET = (process.env.PAYTOTA_SECRET_KEY || "").trim();
const BRAND = (process.env.PAYTOTA_BRAND_ID || "").trim();

if (!SECRET || !BRAND) {
  console.error("Missing PAYTOTA_SECRET_KEY / PAYTOTA_BRAND_ID");
  process.exit(1);
}

console.log("base:", BASE);
console.log("secret_prefix:", SECRET.slice(0, 12) + "... len=" + SECRET.length);
console.log("brand:", BRAND);

const res = await fetch(`${BASE}/api/v1/purchases/`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SECRET}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    client: {
      email: "ukwenzyb@gmail.com",
      phone: "256779735042",
      country: "UG",
    },
    purchase: {
      currency: "UGX",
      products: [{ name: "eFinMoney live-mode check", price: "500" }],
    },
    reference: `efin-livecheck-${Date.now()}`,
    skip_capture: false,
    brand_id: BRAND,
    success_redirect: "https://www.efin.money/wallet/topup?paytota=success",
    failure_redirect: "https://www.efin.money/wallet/topup?paytota=failed",
  }),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text.slice(0, 500) };
}

console.log("\nHTTP", res.status);
console.log("is_test:", json.is_test);
console.log("status:", json.status);
console.log("id:", json.id);
console.log("checkout_url:", json.checkout_url || json.direct_post_url || "(none)");
if (json.__all__ || json.detail || json.error) {
  console.log("error body:", JSON.stringify(json).slice(0, 800));
}
console.log("\nVerdict:", json.is_test === true ? "TEST MODE (Paytota flags this brand/key as test)" : json.is_test === false ? "LIVE MODE" : "UNKNOWN (no is_test field)");
