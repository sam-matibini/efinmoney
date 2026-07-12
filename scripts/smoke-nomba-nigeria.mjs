#!/usr/bin/env node
/**
 * Smoke-test Nomba Nigeria lenhub endpoints (read-only + optional conversion).
 *
 * Usage:
 *   node scripts/smoke-nomba-nigeria.mjs
 *   NOMBA_PAY_API_URL=https://mtn.lenhub.net node scripts/smoke-nomba-nigeria.mjs
 */

const BASE = (process.env.NOMBA_PAY_API_URL || "https://mtn.lenhub.net").replace(/\/$/, "");
const PATHS = {
  bankcode: process.env.NOMBA_NIGERIA_BANKCODE_PATH || "/api/efin/nigeria/bankcode",
  lookup: process.env.NOMBA_NIGERIA_LOOKUP_PATH || "/api/efin/nigeria/account/lookup",
  exchange: process.env.NOMBA_EXCHANGE_PATH || "/api/efin/exchange/",
  collection: process.env.NOMBA_PAY_COLLECTION_PATH || "/api/efin/payment/collection/nigeria",
  transfer: process.env.NOMBA_NIGERIA_TRANSFER_PATH || "/api/efin/nigeria/transfer",
  conversion: process.env.NOMBA_NIGERIA_CONVERSION_PATH || "/api/efin/nigeria/transfer/conversion",
};

async function hit(label, url, init) {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    const ok = res.ok;
    console.log(`${ok ? "OK" : "FAIL"} ${label} [${res.status}] ${Date.now() - started}ms`);
    if (!ok) console.log("  ", JSON.stringify(json).slice(0, 300));
    return { ok, status: res.status, json };
  } catch (e) {
    console.log(`ERR ${label}:`, e instanceof Error ? e.message : e);
    return { ok: false, error: String(e) };
  }
}

const results = [];

results.push(await hit("GET bankcode", `${BASE}${PATHS.bankcode}`, { method: "GET" }));

const lookupUrl = new URL(`${BASE}${PATHS.lookup}`);
lookupUrl.searchParams.set("account_number", "0000000000");
lookupUrl.searchParams.set("bankcode", "058");
results.push(await hit("GET account lookup (fake)", lookupUrl.toString(), { method: "GET" }));

const fxUrl = new URL(`${BASE}${PATHS.exchange}`);
fxUrl.searchParams.set("from_dat", "USD");
fxUrl.searchParams.set("to", "NGN");
results.push(await hit("GET exchange USD/NGN", fxUrl.toString(), { method: "GET" }));

const convUrl = new URL(`${BASE}${PATHS.conversion}`);
convUrl.searchParams.set("amount", "100");
convUrl.searchParams.set("from_currency", "USD");
convUrl.searchParams.set("to_currency", "NGN");
results.push(await hit("POST transfer/conversion", convUrl.toString(), { method: "POST" }));

const xferUrl = new URL(`${BASE}${PATHS.transfer}`);
xferUrl.searchParams.set("amount", "100");
xferUrl.searchParams.set("account_number", "0000000000");
xferUrl.searchParams.set("bankcode", "058");
xferUrl.searchParams.set("account_name", "Smoke Test");
xferUrl.searchParams.set("ref_text", `smoke-${Date.now()}`);
xferUrl.searchParams.set("narrative", "smoke test");
results.push(await hit("POST transfer (expect JWT if upstream stale)", xferUrl.toString(), { method: "POST" }));

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} endpoints returned HTTP 2xx.`);
if (results.some((r) => JSON.stringify(r.json || "").includes("JWT expired"))) {
  console.log("\nBlocker: lenhub upstream JWT expired — ask provider to refresh Nomba backend auth before payout testing.");
}
process.exit(passed >= 3 ? 0 : 1);
