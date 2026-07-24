#!/usr/bin/env node
/**
 * Paytota smoke probe — collection + UGX MoMo payout.
 *
 * Usage (PowerShell):
 *   node scripts/paytota-smoke-test.mjs
 *   node scripts/paytota-smoke-test.mjs --execute   # also execute payout (test wallet)
 *   node scripts/paytota-smoke-test.mjs --payout-only --execute
 *
 * Or put vars in scripts/.paytota.env (gitignored).
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
const DO_EXECUTE = process.argv.includes("--execute");
const PAYOUT_ONLY = process.argv.includes("--payout-only");
const TEST_PHONE = process.env.PAYTOTA_TEST_PAYOUT_PHONE || "256779735042";

if (!SECRET || !BRAND) {
  console.error("Missing PAYTOTA_SECRET_KEY and/or PAYTOTA_BRAND_ID.");
  process.exit(1);
}

function resolveUgNetwork(phone) {
  const digits = String(phone).replace(/\D/g, "");
  let national = digits.startsWith("256") ? digits.slice(3) : digits;
  if (national.startsWith("0")) national = national.slice(1);
  const p2 = national.slice(0, 2);
  if (["70", "74", "75"].includes(p2)) return "airtel";
  return "mtnmomo";
}

function executePhone(phone, network) {
  const digits = String(phone).replace(/\D/g, "");
  let national = digits.startsWith("256") ? digits.slice(3) : digits;
  if (national.startsWith("0")) national = national.slice(1);
  return network === "airtel" ? national : `256${national}`;
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
let card = { json: {} };
let momo = { json: {} };

if (!PAYOUT_ONLY) {
  card = await hit("CARD collection (USD purchase)", "POST", "/api/v1/purchases/", {
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
      products: [{ name: "eFinMoney card probe", price: 100 }],
    },
    reference: `${ref}-card`,
    skip_capture: false,
    brand_id: BRAND,
    success_redirect: "https://efin.money/wallet/topup?paytota=success",
    failure_redirect: "https://efin.money/wallet/topup?paytota=failed",
  });

  momo = await hit("MOMO collection (UGX purchase)", "POST", "/api/v1/purchases/", {
    client: {
      email: process.env.PAYTOTA_TEST_EMAIL || "test@efin.money",
      phone: TEST_PHONE,
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
}

const network = resolveUgNetwork(TEST_PHONE);
const payout = await hit("PAYOUT initiate (UGX mobile)", "POST", "/api/v1/payouts/", {
  client: {
    email: process.env.PAYTOTA_TEST_EMAIL || "test@efin.money",
    phone: TEST_PHONE.startsWith("256") ? TEST_PHONE : `256${TEST_PHONE.replace(/\D/g, "").replace(/^0/, "")}`,
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

await hit("Account balance (best-effort)", "GET", "/api/v1/account/balance/");

let execResult = null;
if (DO_EXECUTE && payout.json?.id) {
  // Official Paytota path: /po/{id}/paytota_proxy/ + { payout_type: "mobile" }
  let execUrl = String(payout.json.execution_url || "").trim();
  if (!execUrl || !/paytota_proxy/.test(execUrl)) {
    execUrl = `${BASE}/po/${payout.json.id}/paytota_proxy/`;
  }
  if (!execUrl.endsWith("/")) execUrl += "/";
  const phone = executePhone(TEST_PHONE, network);
  console.log(`\nExecuting payout → paytota_proxy phone=${phone}`);
  execResult = await hit("PAYOUT execute (UGX mobile)", "POST", execUrl, {
    payout_type: "mobile",
    phone,
  });
}

console.log("\n--- Summary ---");
if (!PAYOUT_ONLY) {
  console.log("Card checkout_url:", card.json?.checkout_url || "(none)");
  console.log("MoMo purchase id:", momo.json?.id || "(none)");
}
console.log("Test phone:", TEST_PHONE, "network guess:", network);
console.log("Payout id:", payout.json?.id || "(none)");
console.log("Payout execution_url:", payout.json?.execution_url || "(none)");
if (DO_EXECUTE) {
  console.log("Execute status:", execResult?.json?.status || execResult?.json?.detail || execResult?.res?.status);
  console.log("Execute ok HTTP:", execResult?.res?.ok);
} else {
  console.log("\nNote: initiate only. Re-run with --execute to POST { payout_type: mobile } to /po/{id}/paytota_proxy/.");
}
