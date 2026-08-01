#!/usr/bin/env node
/**
 * Live API capability probe for Dodo Payments.
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

const key = (process.env.DODO_PAYMENTS_API_KEY || "").trim();
const env = (process.env.DODO_PAYMENTS_ENV || "live").toLowerCase();
const base =
  env === "test" || env === "sandbox"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";

if (!key) {
  console.error("Missing DODO_PAYMENTS_API_KEY");
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
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, json };
}

console.log(JSON.stringify({ base, keyLength: key.length }, null, 2));

const gets = [
  "/products?page_size=20",
  "/payments?page_size=10",
  "/customers?page_size=5",
  "/subscriptions?page_size=5",
  "/refunds?page_size=5",
  "/disputes?page_size=5",
  "/discounts?page_size=5",
  "/webhooks",
  "/brands",
  "/payouts?page_size=5",
  "/withdrawals?page_size=5",
  "/balances",
  "/balance",
  "/wallet",
  "/wallets",
  "/countries",
  "/currencies",
  "/payment-methods",
  "/payment_methods",
  "/licenses?page_size=5",
  "/addons?page_size=5",
  "/meters?page_size=5",
  "/credit_products?page_size=5",
];

const results = [];
for (const path of gets) {
  const r = await dodo("GET", path);
  const keys = r.json && typeof r.json === "object" ? Object.keys(r.json).slice(0, 12) : [];
  const items = Array.isArray(r.json?.items)
    ? r.json.items.length
    : Array.isArray(r.json?.data)
      ? r.json.data.length
      : null;
  results.push({
    path,
    status: r.status,
    ok: r.ok,
    keys,
    items,
    sample: JSON.stringify(r.json).slice(0, 280),
  });
  console.log(`\n=== GET ${path} => ${r.status} ===`);
  console.log(JSON.stringify(r.json, null, 2).slice(0, 900));
}

// Create a $1 USD checkout again to confirm pay-in path
const products = await dodo("GET", "/products?page_size=50");
const items = Array.isArray(products.json?.items) ? products.json.items : [];
let productId = items.find((p) => String(p.name || "").includes("Wallet Top-up (USD)"))?.product_id;
if (!productId) {
  const created = await dodo("POST", "/products", {
    name: "eFinMoney Wallet Top-up (USD)",
    description: "Capability probe product",
    tax_category: "saas",
    price: {
      type: "one_time_price",
      currency: "USD",
      price: 100,
      discount: 0,
      purchasing_power_parity: false,
      pay_what_you_want: true,
    },
  });
  productId = created.json?.product_id;
  console.log("\n=== create product ===", created.status, productId);
}

const checkout = await dodo("POST", "/checkouts", {
  product_cart: [{ product_id: productId, quantity: 1, amount: 100 }],
  customer: { email: "probe@efin.money", name: "Capability Probe" },
  return_url: "https://www.efin.money/wallet/topup?dodo=1&ref=capability_probe",
  metadata: { type: "capability_probe", amount: "1.00", currency: "USD" },
});
console.log("\n=== POST /checkouts =>", checkout.status);
console.log(JSON.stringify(checkout.json, null, 2).slice(0, 600));

// Summarize recent payments
const pays = await dodo("GET", "/payments?page_size=10");
const payItems = Array.isArray(pays.json?.items) ? pays.json.items : [];
console.log("\n=== recent payments summary ===");
for (const p of payItems) {
  console.log(
    [
      p.payment_id || p.id,
      p.status,
      p.currency,
      p.total_amount ?? p.amount,
      p.payment_method || p.payment_method_type || "",
      (p.customer && (p.customer.email || p.customer.name)) || "",
    ].join(" | "),
  );
}

console.log("\n=== ENDPOINT MATRIX ===");
console.log(JSON.stringify(results.map(({ path, status, ok, items }) => ({ path, status, ok, items })), null, 2));
