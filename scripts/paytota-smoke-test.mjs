#!/usr/bin/env node
/**
 * Paytota smoke probe — collection (purchase) + payout initiate.
 *
 * Usage (PowerShell):
 *   $env:PAYTOTA_SECRET_KEY="..."; $env:PAYTOTA_BRAND_ID="..."; node scripts/paytota-smoke-test.mjs
 *
 * Or put vars in scripts/.paytota.env (gitignored pattern — do not commit secrets).
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
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const BASE = (process.env.PAYTOTA_BASE_URL || "https://gate.paytota.com").replace(/\/+$/, "");
const SECRET = process.env.PAYTOTA_SECRET_KEY?.trim();
const BRAND = process.env.PAYTOTA_BRAND_ID?.trim();

if (!SECRET || !BRAND) {
  console.error("Missing PAYTOTA_SECRET_KEY and/or PAYTOTA_BRAND_ID.");
  console.error("Get them from Paytota → Developers after KYC:");
  console.error("  https://gate.paytota.com/login");
  console.error("Then either set env vars or create scripts/.paytota.env:");
  console.error("  PAYTOTA_SECRET_KEY=...");
  console.error("  PAYTOTA_BRAND_ID=...");
  process.exit(1);
}

async function hit(label, method, path, body, extraHeaders = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${SECRET}`,
    ...extraHeaders,
  };
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw: raw.slice(0, 2000) };
  }
  console.log(`\n=== ${label}  ${method} ${url}  HTTP ${res.status} ===`);
  console.log(JSON.stringify(json, null, 2).slice(0, 2500));
  return { res, json, raw };
}

const ref = `efin-probe-${Date.now()}`;

// 1) Card / international-style USD purchase (hosted checkout)
const card = await hit("CARD collection (USD purchase)", "POST", "/api/v1/purchases/", {
  client: {
    email: process.env.PAYTOTA_TEST_EMAIL || "test@efin.money",
    country: "US",
    city: "New York",
    street_address: "1 Test Street",
    zip_code: "10001",
    state: "NY",
  },
  purchase: {
    currency: "USD",
    products: [{ name: "eFinMoney card probe", price: 100 }], // 100 = $1.00 if minor units
  },
  reference: `${ref}-card`,
  skip_capture: false,
  brand_id: BRAND,
  success_redirect: "https://efin.money/wallet/topup?paytota=success",
  failure_redirect: "https://efin.money/wallet/topup?paytota=failed",
});

// 2) Local MoMo-style UGX purchase (if enabled on brand)
const momo = await hit("MOMO collection (UGX purchase)", "POST", "/api/v1/purchases/", {
  client: {
    email: process.env.PAYTOTA_TEST_EMAIL || "test@efin.money",
    phone: process.env.PAYTOTA_TEST_PHONE || "256770123456",
    country: "UG",
  },
  purchase: {
    currency: "UGX",
    products: [{ name: "eFinMoney momo probe", price: "500" }],
  },
  reference: `${ref}-momo`,
  skip_capture: false,
  brand_id: BRAND,
});

// 3) Mobile payout initiate (do NOT auto-execute — avoids sending real money)
const payout = await hit("PAYOUT initiate (UGX mobile)", "POST", "/api/v1/payouts/", {
  client: {
    email: process.env.PAYTOTA_TEST_EMAIL || "test@efin.money",
    phone: process.env.PAYTOTA_TEST_PHONE || "256700123123",
    country: "UG",
  },
  payment: {
    currency: "UGX",
    amount: "500",
    description: "eFinMoney payout probe",
  },
  reference: `${ref}-payout`,
  brand_id: BRAND,
});

// Optional: account balance if documented
await hit("Account balance (best-effort)", "GET", "/api/v1/account/balance/");

console.log("\n--- Summary ---");
console.log("Card checkout_url:", card.json?.checkout_url || card.json?.data?.checkout_url || "(none)");
console.log("Card purchase id:", card.json?.id || "(none)");
console.log("MoMo purchase id:", momo.json?.id || "(none)");
console.log("Payout id:", payout.json?.id || "(none)");
console.log("Payout execution_url:", payout.json?.execution_url || "(none)");
console.log(
  "\nNote: Payout was INITIATED only (not executed). To execute you'd POST to execution_url with {\"payout_type\":\"mobile\"}.",
);
