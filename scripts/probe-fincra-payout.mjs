#!/usr/bin/env node
/**
 * Fincra payout dry-run — profile, wallets, MoMo/bank codes, sample payloads.
 * NEVER posts to /disbursements/payouts.
 *
 *   node scripts/probe-fincra-payout.mjs
 *
 * Loads FINCRA_* from migration-export/secrets.env (or env).
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
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

loadSecrets();

const API_KEY = process.env.FINCRA_SECRET_KEY;
const PUB_KEY = process.env.FINCRA_PUBLIC_KEY;
const BIZ_ENV = process.env.FINCRA_BUSINESS_ID;
const ENV_MODE = (process.env.FINCRA_ENV || "sandbox").toLowerCase();
const isLive = ["live", "production", "prod", "1", "true"].includes(ENV_MODE);
const BASE = (
  process.env.FINCRA_BASE_URL ||
  (isLive ? "https://api.fincra.com" : "https://sandboxapi.fincra.com")
).replace(/\/+$/, "");

if (!API_KEY) {
  console.error("FINCRA_SECRET_KEY missing — set in migration-export/secrets.env");
  process.exit(1);
}

/** Same map as supabase/functions/fincra-payout/index.ts */
const FINCRA_MM_CODE = {
  "KES:mpesa": "MPESA",
  "GHS:mtn": "MTN",
  "GHS:vodafone": "VODAFONE",
  "GHS:airtel": "AIRTELTIGO",
  "UGX:mtn": "MTN",
  "UGX:airtel": "AIRTEL",
  "TZS:airtel": "AIRTEL",
  "TZS:vodafone": "VODACOM",
  "TZS:tigo": "TIGO",
  "ZMW:mtn": "MTN",
  "ZMW:airtel": "AIRTEL",
  "ZMW:zamtel": "ZAMTEL",
  "RWF:mtn": "MTN",
  "RWF:airtel": "AIRTEL",
};

const SEND_CURRENCIES = ["NGN", "KES", "GHS", "UGX", "TZS", "RWF"];
const BALANCE_CURRENCIES = [...SEND_CURRENCIES, "ZMW"];

const COUNTRY_BY_CCY = {
  NGN: "NG",
  KES: "KE",
  GHS: "GH",
  UGX: "UG",
  TZS: "TZ",
  RWF: "RW",
  ZMW: "ZM",
};

const headers = {
  Accept: "application/json",
  "api-key": API_KEY,
  ...(PUB_KEY ? { "x-pub-key": PUB_KEY } : {}),
  ...(BIZ_ENV ? { "x-business-id": BIZ_ENV } : {}),
};

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

function bankCodes(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows.map((b) => String(b.code || b.bankCode || b.id || "").toUpperCase()).filter(Boolean);
}

function bankNames(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows.slice(0, 12).map((b) => `${b.name || "?"} (${b.code || b.bankCode || "?"})`);
}

console.log("=== Fincra payout dry-run (NO payouts) ===\n");
console.log("Base:", BASE);
console.log("FINCRA_ENV:", ENV_MODE, "→", isLive ? "LIVE" : "sandbox");
console.log("Business id (env):", BIZ_ENV || "(unset)");

const me = await get("/profile/business/me");
const biz = me.j?.data ?? {};
const businessId = BIZ_ENV || biz._id || biz.id;
console.log("\n--- Business ---");
console.log("HTTP", me.status, me.ok ? "OK" : "FAIL");
console.log("Name:", biz.name || biz.businessName || "(unknown)");
console.log("Id:", biz._id || biz.id || "(unknown)");
if (BIZ_ENV && biz._id && BIZ_ENV !== biz._id) {
  console.log("⚠ FINCRA_BUSINESS_ID does not match /profile/business/me id");
}

if (!businessId) {
  console.error("No business id — cannot list wallets");
  process.exit(1);
}

const walletsRes = await get(`/wallets?businessID=${encodeURIComponent(businessId)}`);
const wallets = walletsRes.j?.data ?? [];
console.log("\n--- Wallets (payout corridors) ---");
console.log("HTTP", walletsRes.status, walletsRes.ok ? "OK" : "FAIL", `(${wallets.length} total)`);

const byCcy = new Map();
for (const w of wallets) {
  const c = String(w.currency || "").toUpperCase();
  byCcy.set(c, w);
}

const funded = [];
const empty = [];
for (const c of BALANCE_CURRENCIES) {
  const w = byCcy.get(c);
  if (!w) {
    console.log(`  ${c}: (no wallet)`);
    empty.push(c);
    continue;
  }
  const avail = Number(w.availableBalance ?? w.balance ?? 0);
  const ledger = Number(w.ledgerBalance ?? w.availableBalance ?? 0);
  const note = c === "ZMW" ? " [not on Send Fincra toggle]" : "";
  console.log(`  ${c}: available=${avail} ledger=${ledger}${note}`);
  if (avail > 0) funded.push(c);
  else empty.push(c);
}

console.log("\n--- Operator / bank codes vs our fincra-payout map ---");
const mismatches = [];
const matched = [];

for (const ccy of SEND_CURRENCIES) {
  const country = COUNTRY_BY_CCY[ccy];
  const banksRes = await get(`/core/banks?currency=${ccy}&country=${country}`);
  const list = banksRes.j?.data ?? banksRes.j?.banks ?? [];
  const codes = new Set(bankCodes(list));
  console.log(`\n${ccy} (${country}) — HTTP ${banksRes.status}, ${list.length} entries`);

  if (ccy === "NGN") {
    console.log("  Rail: bank_account (need bank_code + 10-digit NUBAN)");
    console.log("  Sample banks:", bankNames(list).slice(0, 6).join(", ") || "(none)");
    if (codes.size === 0) mismatches.push("NGN: no banks returned from /core/banks");
    else matched.push("NGN banks listed");
    continue;
  }

  const needed = Object.entries(FINCRA_MM_CODE)
    .filter(([k]) => k.startsWith(`${ccy}:`))
    .map(([, v]) => v);

  for (const code of needed) {
    const hit = [...codes].some((c) => c === code || c.includes(code) || code.includes(c));
    // Also match by name heuristics (e.g. SAFARICOM for MPESA)
    const nameHit = list.some((b) => {
      const n = String(b.name || "").toUpperCase();
      const c = String(b.code || b.bankCode || "").toUpperCase();
      if (code === "MPESA") return /MPESA|SAFARICOM|M-?PESA/.test(n) || /MPESA|SAFARICOM/.test(c);
      if (code === "AIRTELTIGO") return /AIRTEL.?TIGO|AIRTELTIGO|TIGO/.test(n + c);
      if (code === "VODACOM") return /VODACOM|VODAFONE/.test(n + c);
      return n.includes(code) || c === code;
    });
    const ok = hit || nameHit;
    const alt = list.find((b) => {
      const n = String(b.name || "").toUpperCase();
      const c = String(b.code || b.bankCode || "").toUpperCase();
      if (code === "MPESA") return /MPESA|SAFARICOM|M-?PESA/.test(n + " " + c);
      return false;
    });
    console.log(
      `  need ${code}: ${ok ? "OK" : "MISSING"}${alt && String(alt.code).toUpperCase() !== code ? ` (live code=${alt.code} name=${alt.name})` : ""}`,
    );
    if (ok) matched.push(`${ccy}:${code}`);
    else mismatches.push(`${ccy}: expected mobileMoneyCode ${code} not found in /core/banks`);
  }
  if (list.length && list.length <= 20) {
    console.log("  providers:", bankNames(list).join(", "));
  } else if (list.length) {
    console.log("  sample:", bankNames(list).join(", "));
  }
}

console.log("\n--- Sample payloads (NOT sent) ---");
const sampleBiz = businessId;
console.log(
  JSON.stringify(
    {
      _note: "NGN bank — matches fincra-payout bank_account branch",
      business: sampleBiz,
      sourceCurrency: "NGN",
      destinationCurrency: "NGN",
      amount: "1000",
      description: "eFinMoney transfer to Jane Doe",
      paymentDestination: "bank_account",
      customerReference: "dry-run-transfer-id",
      beneficiary: {
        firstName: "Jane",
        lastName: "Doe",
        type: "individual",
        accountHolderName: "Jane Doe",
        accountNumber: "0123456789",
        bankCode: "058",
      },
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      _note: "KES MoMo — matches fincra-payout mobile_money_wallet branch",
      business: sampleBiz,
      sourceCurrency: "KES",
      destinationCurrency: "KES",
      amount: "10",
      description: "eFinMoney transfer to Jane Doe",
      paymentDestination: "mobile_money_wallet",
      customerReference: "dry-run-transfer-id",
      beneficiary: {
        firstName: "Jane",
        lastName: "Doe",
        type: "individual",
        phone: "+254700000000",
        mobileMoneyCode: "MPESA",
      },
    },
    null,
    2,
  ),
);

console.log("\n=== Summary ===");
console.log("Funded wallets:", funded.length ? funded.join(", ") : "(none)");
console.log("Empty / missing:", empty.length ? empty.join(", ") : "(none)");
console.log("Code checks OK:", matched.length);
console.log("Code mismatches:", mismatches.length ? "" : "(none)");
for (const m of mismatches) console.log("  -", m);

if (!funded.includes("NGN")) {
  console.log("\n⚠ NGN Fincra wallet is empty — fund it before app Send → NGN bank (Fincra) will succeed.");
} else {
  console.log("\n✓ NGN Fincra wallet has balance — ready for manual app Send with Fincra toggle.");
}

console.log("\nDry-run complete. No POST /disbursements/payouts was made.");
