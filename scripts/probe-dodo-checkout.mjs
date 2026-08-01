#!/usr/bin/env node
/**
 * Live/test probe for Dodo Payments checkout (wallet top-up shape).
 *
 * Usage:
 *   node scripts/probe-dodo-checkout.mjs
 *
 * Env (from .env or shell):
 *   DODO_PAYMENTS_API_KEY
 *   DODO_PAYMENTS_ENV=live|test (default live)
 *   DODO_PRODUCT_ID (optional)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
loadEnv(join(__dir, "..", ".env"));
loadEnv(join(__dir, "..", "migration-export", "secrets.env"));

const key = (process.env.DODO_PAYMENTS_API_KEY || process.env.DODO_API_KEY || "").trim();
const env = (process.env.DODO_PAYMENTS_ENV || "live").toLowerCase();
const base = (
  process.env.DODO_PAYMENTS_BASE_URL ||
  (env === "test" || env === "sandbox" ? "https://test.dodopayments.com" : "https://live.dodopayments.com")
).replace(/\/+$/, "");

if (!key) {
  console.error("Missing DODO_PAYMENTS_API_KEY — paste the live key into .env then re-run.");
  process.exit(1);
}

async function dodo(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text.slice(0, 600) }; }
  return { status: res.status, ok: res.ok, json };
}

console.log("Base:", base);
console.log("Key length:", key.length);

const list = await dodo("GET", "/products?page_size=20");
console.log("\n=== GET /products ===", list.status);
const items = Array.isArray(list.json?.items) ? list.json.items
  : Array.isArray(list.json?.data) ? list.json.data : [];
console.log("products:", items.length, items.slice(0, 5).map((p) => `${p.product_id} ${p.name}`));

let productId = (process.env.DODO_PRODUCT_ID || "").trim();
const name = "eFinMoney Wallet Top-up (USD)";
if (!productId) {
  const found = items.find((p) => p.name === name);
  if (found?.product_id) {
    productId = found.product_id;
    console.log("Using existing product:", productId);
  } else {
    const created = await dodo("POST", "/products", {
      name,
      description: "Probe pay-what-you-want top-up product",
      tax_category: "saas",
      price: {
        type: "one_time_price",
        currency: "USD",
        price: 100,
        discount: 0,
        purchasing_power_parity: false,
        pay_what_you_want: true,
      },
      metadata: { efm_type: "wallet_topup", currency: "USD", probe: true },
    });
    console.log("\n=== POST /products ===", created.status, JSON.stringify(created.json).slice(0, 500));
    productId = String(created.json?.product_id || "");
  }
}

if (!productId) {
  console.error("No product_id — cannot create checkout");
  process.exit(1);
}

const checkout = await dodo("POST", "/checkouts", {
  product_cart: [{ product_id: productId, quantity: 1, amount: 100 }], // $1.00
  customer: { email: "probe@efin.money", name: "eFin Probe" },
  return_url: "https://www.efin.money/wallet/topup?dodo=1&ref=probe",
  metadata: {
    type: "wallet_topup",
    user_id: "probe",
    currency: "USD",
    amount: "1.00",
    reference: `probe_dodo_${Date.now()}`,
  },
});

console.log("\n=== POST /checkouts ===", checkout.status);
console.log(JSON.stringify(checkout.json, null, 2).slice(0, 1200));

const url = checkout.json?.checkout_url || checkout.json?.payment_link || checkout.json?.url;
if (checkout.ok && url) {
  console.log("\nRESULT: OK — open this checkout URL to complete a $1 live test:");
  console.log(url);
} else {
  console.log("\nRESULT: FAILED — see message above");
  process.exit(1);
}
