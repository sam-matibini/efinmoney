#!/usr/bin/env node
/**
 * Ensure Fincra settlement + liability ledger accounts exist, then
 * optionally re-verify a stuck top-up reference.
 *
 * Usage:
 *   node scripts/fix-fincra-ledger.mjs
 *   node scripts/fix-fincra-ledger.mjs topup-fincra-...
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadEnvFile(resolve(root, ".env"));
loadEnvFile(resolve(root, "migration-export/secrets.env"));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_URL + service role in .env)");
  process.exit(1);
}

const sb = createClient(url, key);

const SETTLEMENTS = [
  ["1280", "Fincra Settlement - NGN", "NGN"],
  ["1281", "Fincra Settlement - KES", "KES"],
  ["1282", "Fincra Settlement - UGX", "UGX"],
  ["1283", "Fincra Settlement - GHS", "GHS"],
  ["1284", "Fincra Settlement - ZMW", "ZMW"],
  ["1285", "Fincra Settlement - RWF", "RWF"],
  ["1286", "Fincra Settlement - TZS", "TZS"],
  ["1287", "Fincra Settlement - USD", "USD"],
  ["1288", "Fincra Settlement - CAD", "CAD"],
  ["1289", "Fincra Settlement - EUR", "EUR"],
  ["1290", "Fincra Settlement - GBP", "GBP"],
  ["1291", "Fincra Settlement - ZAR", "ZAR"],
  ["1292", "Fincra Settlement - XAF", "XAF"],
  ["1293", "Fincra Settlement - XOF", "XOF"],
  ["1294", "Fincra Settlement - MWK", "MWK"],
];

const LIABILITIES = [
  ["2102", "Customer Wallet Liability - NGN", "NGN"],
  ["2104", "Customer Wallet Liability - EUR", "EUR"],
  ["2105", "Customer Wallet Liability - GBP", "GBP"],
  ["2106", "Customer Wallet Liability - GHS", "GHS"],
  ["2107", "Customer Wallet Liability - TZS", "TZS"],
  ["2108", "Customer Wallet Liability - ZMW", "ZMW"],
  ["2110", "Customer Wallet Liability - KES", "KES"],
  ["2111", "Customer Wallet Liability - UGX", "UGX"],
  ["2112", "Customer Wallet Liability - RWF", "RWF"],
  ["2113", "Customer Wallet Liability - ZAR", "ZAR"],
  ["2114", "Customer Wallet Liability - XAF", "XAF"],
  ["2115", "Customer Wallet Liability - XOF", "XOF"],
  ["2116", "Customer Wallet Liability - MWK", "MWK"],
];

async function ensureAccount({ code, name, account_type, currency_code, description }) {
  const { data: byCode } = await sb.from("ledger_accounts").select("id, code, name").eq("code", code).maybeSingle();
  if (byCode) {
    console.log(`  ok code ${code} → ${byCode.name}`);
    return byCode;
  }
  const { data: byName } = await sb.from("ledger_accounts").select("id, code, name").eq("name", name).maybeSingle();
  if (byName) {
    console.log(`  ok name ${name} (code ${byName.code})`);
    return byName;
  }
  const row = {
    code,
    name,
    account_type,
    currency_code,
    is_active: true,
    is_system: true,
    ...(description ? { description } : {}),
  };
  const { data, error } = await sb.from("ledger_accounts").insert(row).select("id, code, name").single();
  if (error) {
    console.error(`  FAIL ${code} ${name}:`, error.message);
    return null;
  }
  console.log(`  created ${code} ${name}`);
  return data;
}

console.log("=== Ensure Fincra settlement accounts ===");
for (const [code, name, currency_code] of SETTLEMENTS) {
  await ensureAccount({
    code,
    name,
    account_type: "asset",
    currency_code,
    description: `Funds held by Fincra from customer top-ups (${currency_code})`,
  });
}

console.log("\n=== Ensure liability accounts ===");
for (const [code, name, currency_code] of LIABILITIES) {
  await ensureAccount({ code, name, account_type: "liability", currency_code });
}

const { data: ngnCheck } = await sb
  .from("ledger_accounts")
  .select("code, name, currency_code")
  .or("code.eq.1280,code.eq.2102,and(name.ilike.%Fincra Settlement%,currency_code.eq.NGN)")
  .order("code");
console.log("\nNGN/Fincra check:", ngnCheck);

const ref = process.argv[2];
if (ref) {
  console.log("\nStuck payment reference noted:", ref);
  console.log("After deploying fincra-verify-payment, reopen:");
  console.log(`  https://www.efin.money/wallet/topup?reference=${encodeURIComponent(ref)}`);
}
