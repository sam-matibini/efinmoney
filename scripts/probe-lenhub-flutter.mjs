#!/usr/bin/env node
/**
 * Probe Lenhub Flutter wrapper (mtn.lenhub.net/app/flutter/*)
 * Usage: node scripts/probe-lenhub-flutter.mjs
 * Optional live card (charges real money — tiny amount):
 *   LENHUB_CARD_NUMBER=... LENHUB_CARD_EXP_MONTH=09 LENHUB_CARD_EXP_YEAR=27 LENHUB_CARD_CVV=... \
 *   LENHUB_CARD_CURRENCY=USD LENHUB_CARD_AMOUNT=1 node scripts/probe-lenhub-flutter.mjs
 */
const BASE = (process.env.LENHUB_FLUTTER_API_URL || "https://mtn.lenhub.net").replace(/\/+$/, "");

async function hit(method, path, { query = {}, body } = {}) {
  const url = new URL(path, BASE.endsWith("/") ? BASE : BASE + "/");
  // path already absolute-ish
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

console.log(`Base: ${BASE}\n`);

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
  const { status, json } = await hit("GET", "/app/flutter/bank/code/", { query: { country_code: c } });
  console.log(`banks ${c}: HTTP ${status} count=${bankCount(json)}`);
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
  const { status, json } = await hit("POST", "/app/flutter/exchange/rate/", {
    query: { source_currency: s, destination_currency: d, amount: 10 },
  });
  console.log(
    `FX ${s}->${d}: HTTP ${status} ${okFx(json) ? `OK rate=${fxRate(json)}` : `FAIL ${JSON.stringify(json).slice(0, 140)}`}`,
  );
}

// --- Networks ---
console.log("\n=== MoMo networks ===");
for (const c of ["GH", "KE", "UG", "NG", "TZ", "RW", "ZM"]) {
  const { status, json } = await hit("POST", "/app/flutter/create/customer/", { query: { country: c } });
  const nets = (json?.message?.data || []).map((n) => n.network).filter(Boolean).join(",") ||
    (Array.isArray(json?.message) ? JSON.stringify(json.message).slice(0, 80) : JSON.stringify(json).slice(0, 100));
  console.log(`networks ${c}: HTTP ${status} ${nets}`);
}

// --- Account verify (NG sample — may fail if account invalid; just capability signal) ---
console.log("\n=== Verify account (NG smoke) ===");
{
  const { status, json } = await hit("POST", "/app/flutter/verify/account/", {
    query: { account_number: "0690000031", currency: "NGN", bank_code: "044" },
  });
  console.log(`verify NG: HTTP ${status} ${JSON.stringify(json).slice(0, 220)}`);
}

// --- Virtual account ---
console.log("\n=== Virtual account ===");
{
  const { status, json } = await hit("POST", "/app/flutter/create/virtual/account/", {
    query: {
      email: "probe@efin.money",
      amount: 1000,
      narration: "efin-probe-va",
    },
  });
  console.log(`VA: HTTP ${status} ${JSON.stringify(json).slice(0, 220)}`);
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
    callback: "https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/lenhub-flutter-webhook",
    email: process.env.LENHUB_CARD_EMAIL || "probe@efin.money",
    currency: (process.env.LENHUB_CARD_CURRENCY || "USD").toUpperCase(),
  };
  const { status, json } = await hit("POST", "/app/flutter/card/payment/create/", { body });
  console.log(
    `card ${body.currency} ${body.amount}: HTTP ${status} chargeId=${pickChargeId(json)} type=${pickType(json)} body=${JSON.stringify(json).slice(0, 280)}`,
  );
} else {
  console.log("Skipped (set LENHUB_CARD_NUMBER + EXP + CVV to live-test card create).");
  console.log("Postman already showed: chargeId + type=additional_fields works.");
}

console.log("\nDone. Payouts skipped by default (moves money). Set LENHUB_PROBE_PAYOUT=1 with bank details to try.");
