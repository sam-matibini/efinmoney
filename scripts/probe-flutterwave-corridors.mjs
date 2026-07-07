#!/usr/bin/env node
/**
 * Local Flutterwave corridor probe (no payment completion).
 *
 * Usage (PowerShell):
 *   1. Copy scripts/.flw-probe.env.example → scripts/.flw-probe.env and add FLW_SECRET_KEY
 *   2. node scripts/probe-flutterwave-corridors.mjs
 *
 * Or:
 *   $env:FLW_SECRET_KEY="FLWSECK-..."
 *   node scripts/probe-flutterwave-corridors.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dir, "..");

function loadEnvFile(path) {
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

// scripts/.flw-probe.env first, then project root .env (same key many devs already have there)
loadEnvFile(join(__dir, ".flw-probe.env"));
loadEnvFile(join(rootDir, ".env"));

const secret = (process.env.FLW_SECRET_KEY || "").trim();
const base = (process.env.FLW_PROXY_URL || "https://api.flutterwave.com").replace(/\/+$/, "");
const api = `${base}/v3`;

if (!secret) {
  console.error("Missing FLW_SECRET_KEY.");
  console.error("  Add FLW_SECRET_KEY=... to project .env or scripts/.flw-probe.env");
  console.error("  Or PowerShell: $env:FLW_SECRET_KEY=\"FLWSECK-...\"");
  process.exit(1);
}

async function flw(path, opts = {}) {
  const res = await fetch(`${api}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  const ok = res.ok && (json.status === "success" || json.status === "successful");
  return { ok, status: res.status, json };
}

async function probeInit(currency, amount = 10) {
  const payload = {
    tx_ref: `efm_local_probe_${currency.toLowerCase()}_${Date.now()}`,
    amount: String(amount),
    currency,
    redirect_url: "https://www.efin.money/wallet/topup?flw_probe=1",
    payment_options: "card",
    customer: { email: "corridor-probe@efin.money", name: "eFin Probe" },
    meta: { type: "corridor_probe" },
    customizations: { title: "eFinMoney Probe" },
  };
  const r = await flw("/payments", { method: "POST", body: JSON.stringify(payload) });
  return {
    currency,
    ok: r.ok,
    link: r.json?.data?.link || null,
    message: r.json?.message || r.json?.error || (r.ok ? "link created" : `HTTP ${r.status}`),
  };
}

const currencies = (process.env.PROBE_CURRENCIES || "CAD,USD,NGN").split(",").map((s) => s.trim().toUpperCase());

console.log("Flutterwave corridor probe");
console.log("API base:", api);
console.log("Key prefix:", secret.slice(0, 12) + "...");
console.log("");

const bal = await flw("/balances");
if (bal.ok) {
  console.log("Balances:");
  for (const row of bal.json.data || []) {
    console.log(
      `  ${row.currency}: available=${row.available_balance ?? row.balance} pending=${row.pending_balance ?? 0}`,
    );
  }
} else {
  console.log("Balances: FAILED —", bal.json?.message || bal.status);
}

console.log("\nPayment init probes (card checkout link, not charged):");
for (const c of currencies) {
  const p = await probeInit(c);
  console.log(`  ${c}: ${p.ok ? "OK" : "FAIL"} — ${p.message}`);
  if (p.link) console.log(`       link: ${p.link.slice(0, 80)}...`);
}

console.log("\nDone. ok=OK means Flutterwave accepted that collect currency on your merchant account.");
