#!/usr/bin/env node
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
  }
}

const BASE = (process.env.PAYTOTA_BASE_URL || "https://gate.paytota.com").replace(/\/+$/, "");
const SECRET = process.env.PAYTOTA_SECRET_KEY;
const BRAND = process.env.PAYTOTA_BRAND_ID;
const email = process.env.PAYTOTA_TEST_EMAIL || "test@efin.money";
const phone = process.env.PAYTOTA_TEST_PHONE || "256770123456";

async function hit(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  console.log(`\n${method} ${path} → ${res.status}`);
  console.log(JSON.stringify(json, null, 2).slice(0, 800));
  return { res, json };
}

const purchase = await hit("POST", "/api/v1/purchases/", {
  client: { email, phone, country: "UG" },
  purchase: { currency: "UGX", products: [{ name: "efin ugx stk", price: "500" }] },
  reference: `efin-stk-${Date.now()}`,
  skip_capture: false,
  brand_id: BRAND,
  success_redirect: "https://www.efin.money/wallet/topup?paytota=success",
  failure_redirect: "https://www.efin.money/wallet/topup?paytota=failed",
});

const id = purchase.json?.id;
if (id) {
  for (const p of [
    `/api/v1/purchases/${id}/mtnmomo/`,
    `/api/v1/purchases/${id}/airtel/`,
    `/p/${id}/mtnmomo/`,
    `/p/${id}/airtel/`,
  ]) {
    await hit("POST", p, { phone: phone.replace(/^256/, "") });
  }
}

const payout = await hit("POST", "/api/v1/payouts/", {
  client: { email, phone, country: "UG" },
  payment: { currency: "UGX", amount: "500", description: "airtel probe" },
  reference: `efin-po-air-${Date.now()}`,
  brand_id: BRAND,
});

if (payout.json?.id) {
  // Official: /po/{id}/paytota_proxy/ + payout_type=mobile
  await hit("POST", `/po/${payout.json.id}/paytota_proxy/`, { payout_type: "mobile", phone });
  await hit("POST", `/po/${payout.json.id}/paytota_proxy/`, { payout_type: "mobile" });
  // Legacy (expect terminal disabled if proxy works)
  await hit("POST", `/po/${payout.json.id}/airtel/`, { phone: "770123456" });
  await hit("POST", `/po/${payout.json.id}/mtnmomo/`, { phone });
}
