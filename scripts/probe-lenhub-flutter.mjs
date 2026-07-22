#!/usr/bin/env node
/**
 * Probe Lenhub Flutter wrapper (mtn.lenhub.net/app/flutter/*)
 * Usage: node scripts/probe-lenhub-flutter.mjs
 */
const BASE = (process.env.LENHUB_FLUTTER_API_URL || "https://mtn.lenhub.net").replace(/\/+$/, "");

async function hit(method, path, query = {}) {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { method, headers: { Accept: "application/json" } });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: res.status, json };
}

function okFx(json) {
  const m = json?.message;
  const rate = m?.status?.data?.rate || m?.data?.rate;
  const failed = m?.statusCode === 401 || m?.status?.status === "failed";
  return Boolean(rate) && !failed;
}

function bankCount(json) {
  const data = json?.message?.data || json?.message?.message?.data || json?.data;
  return Array.isArray(data) ? data.length : 0;
}

console.log(`Base: ${BASE}\n`);

const countries = ["NG", "GH", "KE", "UG", "TZ", "RW", "ZM"];
for (const c of countries) {
  const { status, json } = await hit("GET", "/app/flutter/bank/code/", { country_code: c });
  console.log(`banks ${c}: HTTP ${status} count=${bankCount(json)}`);
}

const pairs = [
  ["CAD", "NGN"],
  ["USD", "NGN"],
  ["CAD", "GHS"],
  ["USD", "KES"],
  ["EUR", "UGX"],
  ["GBP", "TZS"],
];
for (const [s, d] of pairs) {
  const { status, json } = await hit("POST", "/app/flutter/exchange/rate/", {
    source_currency: s,
    destination_currency: d,
    amount: 10,
  });
  const rate = json?.message?.status?.data?.rate || json?.message?.data?.rate;
  console.log(`FX ${s}->${d}: HTTP ${status} ${okFx(json) ? `OK rate=${rate}` : `FAIL ${JSON.stringify(json).slice(0, 120)}`}`);
}

for (const c of ["GH", "KE", "UG", "NG"]) {
  const { status, json } = await hit("POST", "/app/flutter/create/customer/", { country: c });
  const nets = (json?.message?.data || []).map((n) => n.network).filter(Boolean).join(",");
  console.log(`networks ${c}: HTTP ${status} ${nets || JSON.stringify(json).slice(0, 100)}`);
}

console.log("\nDone. Money-moving endpoints (card/payout) require LENHUB_FLUTTER_LIVE=1 + real credentials.");
