#!/usr/bin/env node
/**
 * Tiny NGN bank payout probe via company Flutterwave (V3 /transfers through proxy).
 * Uses Opay account from prior tests unless overridden.
 *
 * Usage:
 *   node scripts/probe-flw-ngn-payout.mjs
 * Env:
 *   FLW_SECRET_KEY (required)
 *   FLW_PROXY_URL (default: Cloudflare worker)
 *   FLW_PROBE_ACCOUNT / FLW_PROBE_BANK_CODE / FLW_PROBE_AMOUNT
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv(path) {
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
loadEnv(join(__dir, ".flw-probe.env"));
loadEnv(join(__dir, "..", ".env"));
loadEnv(join(__dir, "..", "migration-export", "secrets.env"));

const secret = (process.env.FLW_SECRET_KEY || "").trim();
const proxy = (process.env.FLW_PROXY_URL || "https://efin-flw-proxy.ukwenzyb.workers.dev").replace(/\/+$/, "");
const account = (process.env.FLW_PROBE_ACCOUNT || "8068608302").trim();
const bankCode = (process.env.FLW_PROBE_BANK_CODE || "").trim(); // resolve if empty
const amount = Number(process.env.FLW_PROBE_AMOUNT || "100");
const name = (process.env.FLW_PROBE_NAME || "Test User").trim();

if (!secret) {
  console.error("Missing FLW_SECRET_KEY");
  process.exit(1);
}

async function flw(method, path, body) {
  const res = await fetch(`${proxy}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text.slice(0, 800) };
  }
  return { status: res.status, json, text: text.slice(0, 1200) };
}

async function resolveOpayBankCode() {
  if (bankCode) return bankCode;
  const { status, json } = await flw("GET", "/v3/banks/NG");
  console.log("banks/NG:", status, json?.status || json?.message || "");
  const banks = Array.isArray(json?.data) ? json.data : [];
  const opay = banks.find((b) => /opay/i.test(String(b?.name || "")));
  if (!opay) {
    console.log("Could not find Opay in bank list; sample:", banks.slice(0, 5).map((b) => `${b.code} ${b.name}`));
    return null;
  }
  console.log("Resolved Opay:", opay.code, opay.name);
  return String(opay.code);
}

async function main() {
  console.log("Proxy:", proxy);
  console.log("Amount:", amount, "NGN →", account);

  // Egress IP check (if worker exposes it)
  try {
    const ipRes = await fetch(`${proxy}/egress-ip`);
    console.log("egress-ip:", ipRes.status, (await ipRes.text()).slice(0, 200));
  } catch (e) {
    console.log("egress-ip failed:", e.message);
  }

  const code = await resolveOpayBankCode();
  if (!code) process.exit(1);

  // Name enquiry
  const resolve = await flw("POST", "/v3/accounts/resolve", {
    account_number: account,
    account_bank: code,
  });
  console.log("\n=== account resolve ===");
  console.log(resolve.status, JSON.stringify(resolve.json).slice(0, 500));

  const recipientName =
    resolve.json?.data?.account_name ||
    name;

  const reference = `efin-flw-ngn-${Date.now().toString(36)}`;
  const payload = {
    account_bank: code,
    account_number: account,
    amount,
    narration: "eFin Flutterwave NGN payout probe",
    currency: "NGN",
    reference,
    beneficiary_name: recipientName,
  };

  console.log("\n=== V3 transfer ===");
  console.log("reference:", reference);
  const tx = await flw("POST", "/v3/transfers", payload);
  console.log(tx.status, JSON.stringify(tx.json).slice(0, 1200));

  const msg = String(
    tx.json?.message || tx.json?.data?.complete_message || tx.json?.error || "",
  ).toLowerCase();
  if (tx.status >= 200 && tx.status < 300 && (tx.json?.status === "success" || tx.json?.data?.id)) {
    console.log("\nRESULT: SUCCESS — transfers appear enabled. id=", tx.json?.data?.id);
  } else if (msg.includes("not enabled") || msg.includes("disabled")) {
    console.log("\nRESULT: STILL DISABLED — merchant transfers not enabled on API yet");
  } else if (msg.includes("whitelist") || msg.includes("ip")) {
    console.log("\nRESULT: IP WHITELIST — transfers preference may be on, but IP still blocked");
  } else {
    console.log("\nRESULT: FAILED — see message above");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
