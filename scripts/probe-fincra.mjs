#!/usr/bin/env node
/**
 * Fincra sandbox probe — business info, wallets, checkout link.
 * Reads FINCRA_* from migration-export/secrets.env or env.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const secretsPath = resolve(__dir, "../migration-export/secrets.env");

function loadSecrets() {
  if (!existsSync(secretsPath)) return;
  for (const line of readFileSync(secretsPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

loadSecrets();

const API_KEY = process.env.FINCRA_SECRET_KEY;
const PUB_KEY = process.env.FINCRA_PUBLIC_KEY;
const BIZ = process.env.FINCRA_BUSINESS_ID;
const BASE = (process.env.FINCRA_BASE_URL || "https://sandboxapi.fincra.com").replace(/\/+$/, "");

if (!API_KEY) {
  console.error("FINCRA_SECRET_KEY missing — set in migration-export/secrets.env");
  process.exit(1);
}

const headers = {
  Accept: "application/json",
  "api-key": API_KEY,
  ...(PUB_KEY ? { "x-pub-key": PUB_KEY } : {}),
  ...(BIZ ? { "x-business-id": BIZ } : {}),
};

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

console.log("=== Fincra probe ===\n");

const me = await get("/profile/business/me");
console.log("Business:", me.ok ? me.j?.data?.name : me.j);
if (me.j?.data?._id && !BIZ) {
  console.log("  → Set FINCRA_BUSINESS_ID=" + me.j.data._id);
}

const businessId = BIZ || me.j?.data?._id;
if (businessId) {
  const wallets = await get(`/wallets?businessID=${encodeURIComponent(businessId)}`);
  const list = wallets.j?.data ?? [];
  console.log("\nWallets (non-zero):");
  for (const w of list.filter((x) => Number(x.availableBalance) > 0).slice(0, 8)) {
    console.log(`  ${w.currency}: ${w.availableBalance}`);
  }
  if (!list.some((x) => Number(x.availableBalance) > 0)) {
    console.log("  (all zero — fund sandbox via Fincra dashboard → Funding Test Balance)");
  }
}

if (PUB_KEY && businessId) {
  const ref = `efm_probe_${Date.now()}`;
  const checkout = await post("/checkout/payments", {
    amount: 1000,
    currency: "NGN",
    reference: ref,
    feeBearer: "customer",
    redirectUrl: "https://www.efin.money/wallet/topup?provider=fincra",
    customer: { name: "Probe User", email: "probe@efin.money" },
    metadata: { type: "probe" },
  });
  console.log("\nCheckout NGN 1000:", checkout.ok ? checkout.j?.data?.link : checkout.j);
}

console.log("\nWebhook URL (set in Fincra dashboard):");
console.log("  https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/fincra-webhook");
console.log("\nFor payout corridor dry-run (balances + MoMo codes, no payouts):");
console.log("  node scripts/probe-fincra-payout.mjs");
