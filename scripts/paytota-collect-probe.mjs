#!/usr/bin/env node
/**
 * Probe Paytota UGX MoMo collection against a real test MSISDN.
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
    if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
  }
}

const BASE = (process.env.PAYTOTA_BASE_URL || "https://gate.paytota.com").replace(/\/+$/, "");
const SECRET = process.env.PAYTOTA_SECRET_KEY;
const BRAND = process.env.PAYTOTA_BRAND_ID;
const email = process.env.PAYTOTA_TEST_EMAIL || "ukwenzyb@gmail.com";
const phone = process.env.PAYTOTA_TEST_COLLECT_PHONE || "256779735042";

if (!SECRET || !BRAND) {
  console.error("Missing PAYTOTA_SECRET_KEY / PAYTOTA_BRAND_ID");
  process.exit(1);
}

async function hit(label, method, pathOrUrl, body, opts = {}) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${SECRET}`,
    ...(opts.extraHeaders || {}),
  };
  let payload;
  if (body != null) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, {
    method,
    headers,
    body: payload,
    redirect: opts.redirect || "manual",
  });
  const loc = res.headers.get("location");
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  console.log(`\n=== ${label} ===`);
  console.log(`${method} ${url}`);
  console.log(`HTTP ${res.status}${loc ? `  Location: ${loc}` : ""}`);
  console.log(JSON.stringify(json, null, 2).slice(0, 2000));
  return { res, json, loc, status: res.status };
}

console.log("Collect probe phone:", phone, "brand:", BRAND);

const purchase = await hit("1) Create UGX MoMo purchase", "POST", "/api/v1/purchases/", {
  client: { email, phone, country: "UG" },
  purchase: {
    currency: "UGX",
    products: [{ name: "eFinMoney UGX collect probe", price: "500" }],
    payment_method_whitelist: ["airtel", "mtnmomo"],
  },
  reference: `efin-collect-${Date.now()}`,
  skip_capture: false,
  brand_id: BRAND,
  success_redirect: "https://www.efin.money/wallet/topup?paytota=success",
  failure_redirect: "https://www.efin.money/wallet/topup?paytota=failed",
});

const id = purchase.json?.id;
const checkout = purchase.json?.checkout_url;
const direct = purchase.json?.direct_post_url || purchase.json?.direct_post;
console.log("\n--- purchase summary ---");
console.log("id:", id || "(none)");
console.log("status:", purchase.json?.status || "(none)");
console.log("checkout_url:", checkout || "(none)");
console.log("direct_post_url:", direct || "(none)");
console.log("is_test:", purchase.json?.is_test);

if (!id) {
  console.log("\nFAIL: purchase not created");
  process.exit(1);
}

// Exact path used by our edge function (paytota-collection)
{
  const url = `${BASE}/p/${id}/`;
  const form = new FormData();
  form.append("s2s", "true");
  form.append("pm", "paytota_proxy");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${SECRET}`,
    },
    body: form,
    redirect: "manual",
  });
  const loc = res.headers.get("location");
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  console.log("\n=== 2) App STK path: POST /p/{id}/ s2s=true pm=paytota_proxy ===");
  console.log(`HTTP ${res.status}${loc ? `  Location: ${loc}` : ""}`);
  console.log(JSON.stringify(json, null, 2).slice(0, 2000));
}

// Network-specific execute (docs style)
for (const network of ["mtnmomo", "airtel"]) {
  const national = phone.replace(/\D/g, "").replace(/^256/, "").replace(/^0/, "");
  const e164 = `256${national}`;
  const execPhone = network === "airtel" ? national : e164;
  const url = `${BASE}/p/${id}/${network}/`;
  await hit(
    `3) Network execute ${network} phone=${execPhone}`,
    "POST",
    url,
    { phone: execPhone },
    { redirect: "manual" },
  );
}

if (checkout) {
  console.log("\nHosted checkout is available — open:", checkout);
}

console.log("\nDone.");
