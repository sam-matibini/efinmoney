#!/usr/bin/env node
/**
 * Probe Lenhub Flutter wrapper (efincash.lenhub.net/v1/flutterwave/flutter/*)
 * Usage: node scripts/probe-lenhub-flutter.mjs
 * Optional live card (charges real money — tiny amount):
 *   LENHUB_CARD_NUMBER=... LENHUB_CARD_EXP_MONTH=09 LENHUB_CARD_EXP_YEAR=27 LENHUB_CARD_CVV=... \
 *   LENHUB_CARD_CURRENCY=NGN LENHUB_CARD_AMOUNT=100 node scripts/probe-lenhub-flutter.mjs
 */
const BASE = (process.env.LENHUB_FLUTTER_API_URL || "https://efincash.lenhub.net").replace(/\/+$/, "");
const PREFIX = "/v1/flutterwave/flutter";

async function hit(method, path, { query = {}, body } = {}) {
  const u = new URL(path.startsWith("http") ? path : `${BASE}${path.startsWith("/") ? "" : "/"}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const init = { method, headers: { Accept: "application/json" } };
  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(u, init);
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json, raw: text };
}

function okFx(json) {
  const m = json?.message;
  const rate = m?.status?.data?.rate || m?.data?.rate;
  const failed = m?.statusCode === 401 || m?.status?.status === "failed";
  return Boolean(rate) && !failed;
}

function fxRate(json) {
  return json?.message?.status?.data?.rate || json?.message?.data?.rate || null;
}

function bankCount(json) {
  const data = json?.message?.data || json?.message?.message?.data || json?.data;
  return Array.isArray(data) ? data.length : 0;
}

function pickChargeId(json) {
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const f = walk(item);
        if (f) return f;
      }
      return null;
    }
    for (const k of ["chargeId", "charge_id", "id"]) {
      if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
    }
    for (const nest of ["message", "data", "status", "payment", "charge"]) {
      if (obj[nest]) {
        const f = walk(obj[nest]);
        if (f) return f;
      }
    }
    return null;
  };
  return walk(json);
}

function pickType(json) {
  const msg = json?.message;
  if (Array.isArray(msg) && msg[0]?.type) return String(msg[0].type);
  return null;
}

function summarizeFail(json) {
  const s = JSON.stringify(json);
  return s.length > 160 ? s.slice(0, 160) : s;
}

console.log(`Base: ${BASE}`);
console.log(`Prefix: ${PREFIX}\n`);

// --- Parser self-check (Postman shape) ---
const sample = {
  status: "success",
  message: [{ status: 200, type: "additional_fields", chargeId: "chg_tGMYWGY7S2", message: "redirect to add additional fields" }],
};
console.log(`parser chargeId: ${pickChargeId(sample)} (expect chg_tGMYWGY7S2)`);
console.log(`parser type: ${pickType(sample)} (expect additional_fields)\n`);

// --- Banks ---
console.log("=== Banks ===");
const countries = ["NG", "GH", "KE", "UG", "TZ", "RW", "ZM"];
for (const c of countries) {
  const { status, json } = await hit("GET", `${PREFIX}/bank/code/`, { query: { country_code: c } });
  console.log(`banks ${c}: HTTP ${status} count=${bankCount(json)} ${bankCount(json) ? "" : summarizeFail(json)}`);
}

// --- FX ---
console.log("\n=== FX ===");
const pairs = [
  ["CAD", "NGN"],
  ["USD", "NGN"],
  ["CAD", "GHS"],
  ["USD", "GHS"],
  ["USD", "KES"],
  ["CAD", "KES"],
  ["EUR", "UGX"],
  ["GBP", "TZS"],
  ["USD", "RWF"],
  ["USD", "ZMW"],
  ["NGN", "GHS"],
  ["CAD", "USD"],
];
for (const [s, d] of pairs) {
  const { status, json } = await hit("POST", `${PREFIX}/exchange/rate/`, {
    query: { source_currency: s, destination_currency: d, amount: 10 },
  });
  console.log(
    `FX ${s}->${d}: HTTP ${status} ${okFx(json) ? `OK rate=${fxRate(json)}` : `FAIL ${summarizeFail(json)}`}`,
  );
}

// --- Networks (new check/mobile/networks endpoint) ---
console.log("\n=== MoMo networks ===");
for (const c of ["GH", "KE", "UG", "NG", "TZ", "RW", "ZM"]) {
  const { status, json } = await hit("POST", `${PREFIX}/check/mobile/networks/`, { query: { country: c } });
  const data = json?.message?.data || json?.message?.message?.data || json?.data;
  const nets = Array.isArray(data)
    ? data.map((n) => n.network || n.name).filter(Boolean).join(",")
    : summarizeFail(json);
  console.log(`networks ${c}: HTTP ${status} ${nets}`);
}

// --- Account verify (NG sample) ---
console.log("\n=== Verify account (NG smoke) ===");
{
  const { status, json } = await hit("POST", `${PREFIX}/verify/account/`, {
    query: { account_number: "0690000031", currency: "NGN", bank_code: "044" },
  });
  console.log(`verify NG: HTTP ${status} ${summarizeFail(json)}`);
}

// --- Virtual account ---
console.log("\n=== Virtual account ===");
{
  const { status, json } = await hit("POST", `${PREFIX}/create/virtual/account/`, {
    query: {
      email: "probe@efin.money",
      amount: 1000,
      narration: "efin-probe-va",
    },
  });
  console.log(`VA: HTTP ${status} ${summarizeFail(json)}`);
}

// --- New Kenya MoMo route exists? (no live money — missing required fields would 4xx; we send probe-shaped params) ---
console.log("\n=== Kenya MoMo route smoke (no live payout intent) ===");
{
  const { status, json } = await hit("POST", `${PREFIX}/kenya/mobile/money/transfer/`, {
    query: {
      amount: 1,
      number: "254700000000",
      first_name: "Probe",
      last_name: "User",
      network: "MPESA",
      source_currency: "USD",
      narration: "efin-route-smoke",
    },
  });
  console.log(`kenya momo: HTTP ${status} ${summarizeFail(json)}`);
}

// --- Elicate Zambia route smoke ---
console.log("\n=== Elicate Zambia route smoke ===");
{
  const { status, json } = await hit("POST", "/v1/elicate/flutter/zambia/payout/", {
    query: {
      amount: 1,
      account_type: "mobile_money",
      account_number: "260970000000",
      fullname: "Probe User",
      narrative: "efin-route-smoke",
    },
  });
  console.log(`zambia elicate: HTTP ${status} ${summarizeFail(json)}`);
}

// --- Optional live card create ---
console.log("\n=== Card create ===");
const pan = process.env.LENHUB_CARD_NUMBER?.replace(/\s+/g, "");
if (pan) {
  const body = {
    card_number: pan,
    expiry_date_month: String(process.env.LENHUB_CARD_EXP_MONTH || "").padStart(2, "0"),
    expiry_date_year: String(process.env.LENHUB_CARD_EXP_YEAR || "").slice(-2),
    cvv: String(process.env.LENHUB_CARD_CVV || ""),
    amount: Number(process.env.LENHUB_CARD_AMOUNT || 1),
    callback: "https://efin-flw-proxy.ukwenzyb.workers.dev/webhooks/lenhub-flutter",
    email: process.env.LENHUB_CARD_EMAIL || "probe@efin.money",
    currency: (process.env.LENHUB_CARD_CURRENCY || "NGN").toUpperCase(),
  };
  const { status, json } = await hit("POST", `${PREFIX}/card/payment/create/`, { body });
  console.log(
    `card ${body.currency} ${body.amount}: HTTP ${status} chargeId=${pickChargeId(json)} type=${pickType(json)} body=${summarizeFail(json)}`,
  );
} else {
  console.log("Skipped (set LENHUB_CARD_NUMBER + EXP + CVV to live-test card create).");
}

console.log("\nDone. No redeploy performed.");
