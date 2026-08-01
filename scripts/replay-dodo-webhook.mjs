/**
 * Replay a payment.succeeded webhook to credit a missing Dodo top-up.
 * Uses Standard Webhooks signing (same as Dodo).
 */
import { createHmac, randomUUID } from "node:crypto";
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
loadEnv(join(__dir, "..", ".env"));

const paymentId = process.argv[2] || "pay_0NkNT4XfWp0rfE83BdPYf";
const apiKey = process.env.DODO_PAYMENTS_API_KEY;
const whsec = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
const webhookUrl =
  process.env.DODO_WEBHOOK_URL ||
  "https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/dodo-webhook";

if (!apiKey || !whsec) {
  console.error("Need DODO_PAYMENTS_API_KEY and DODO_PAYMENTS_WEBHOOK_KEY in .env");
  process.exit(1);
}

const payRes = await fetch(`https://live.dodopayments.com/payments/${paymentId}`, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
});
const pay = await payRes.json();
if (!payRes.ok) {
  console.error("Fetch payment failed", payRes.status, pay);
  process.exit(1);
}

const payload = {
  business_id: pay.business_id || "bus_0NkGh1gvlgoS6ZFFpmJOb",
  type: "payment.succeeded",
  timestamp: new Date().toISOString(),
  data: {
    payload_type: "Payment",
    ...pay,
  },
};
const body = JSON.stringify(payload);
const msgId = `msg_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
const ts = Math.floor(Date.now() / 1000).toString();

// Standard Webhooks: secret is base64 after optional whsec_ prefix
const secretRaw = whsec.startsWith("whsec_") ? whsec.slice("whsec_".length) : whsec;
let keyBuf;
try {
  keyBuf = Buffer.from(secretRaw, "base64");
  if (keyBuf.length < 16) keyBuf = Buffer.from(secretRaw, "utf8");
} catch {
  keyBuf = Buffer.from(secretRaw, "utf8");
}

const toSign = `${msgId}.${ts}.${body}`;
const sig = createHmac("sha256", keyBuf).update(toSign, "utf8").digest("base64");
const signatureHeader = `v1,${sig}`;

console.log("Posting to", webhookUrl);
console.log("payment", paymentId, "status", pay.status, "meta", pay.metadata);

const res = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "webhook-id": msgId,
    "webhook-timestamp": ts,
    "webhook-signature": signatureHeader,
  },
  body,
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 800));

if (!res.ok) {
  // Retry with UTF-8 secret (some dashboards store the whole whsec_ string as the HMAC key)
  const key2 = Buffer.from(whsec, "utf8");
  const sig2 = createHmac("sha256", key2).update(toSign, "utf8").digest("base64");
  const res2 = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": msgId + "b",
      "webhook-timestamp": ts,
      "webhook-signature": `v1,${sig2}`,
    },
    body,
  });
  const text2 = await res2.text();
  console.log("\nRetry (utf8 whole secret) HTTP", res2.status);
  console.log(text2.slice(0, 800));
}
