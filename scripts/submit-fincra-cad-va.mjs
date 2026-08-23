#!/usr/bin/env node
/**
 * Submit Fincra CAD Interac VA request (individual KYC payload).
 *
 * PowerShell:
 *   $env:FINCRA_SECRET_KEY="api_live_..."
 *   node scripts/submit-fincra-cad-va.mjs
 *
 * Optional:
 *   $env:FINCRA_BUSINESS_ID="..."
 *   $env:FINCRA_PAYLOAD="C:\Users\user\Desktop\Efin-Projects\fincra-cad-va-request.json"
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const defaultPayload = resolve(__dir, "../../fincra-cad-va-request.json");
const payloadPath = process.env.FINCRA_PAYLOAD || defaultPayload;

const secret = (process.env.FINCRA_SECRET_KEY || "").trim();
const biz = (process.env.FINCRA_BUSINESS_ID || "").trim();
const base = (process.env.FINCRA_BASE_URL || "https://api.fincra.com").replace(/\/+$/, "");

if (!secret) {
  console.error("Set FINCRA_SECRET_KEY first (Fincra dashboard → API Keys).");
  process.exit(1);
}
if (!existsSync(payloadPath)) {
  console.error("Payload file missing:", payloadPath);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
payload.merchantReference = payload.merchantReference || `efm-cad-${Date.now()}`;

const headers = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "api-key": secret,
};
if (biz) headers["x-business-id"] = biz;

console.log("POST", `${base}/profile/virtual-accounts/requests`);
console.log("Account:", payload.KYCInformation?.firstName, payload.KYCInformation?.lastName);
console.log("Email:", payload.KYCInformation?.email);

const res = await fetch(`${base}/profile/virtual-accounts/requests`, {
  method: "POST",
  headers,
  body: JSON.stringify(payload),
});
const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = { raw: text.slice(0, 2000) };
}

console.log("HTTP", res.status);
console.log(JSON.stringify(json, null, 2));
process.exit(res.ok ? 0 : 1);
