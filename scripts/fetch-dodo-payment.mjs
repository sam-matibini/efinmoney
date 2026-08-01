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

const key = process.env.DODO_PAYMENTS_API_KEY;
const paymentId = process.argv[2] || "pay_0NkNT4XfWp0rfE83BdPYf";
const res = await fetch(`https://live.dodopayments.com/payments/${paymentId}`, {
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
});
const j = await res.json();
console.log("HTTP", res.status);
console.log(JSON.stringify({
  payment_id: j.payment_id,
  status: j.status,
  total_amount: j.total_amount,
  currency: j.currency,
  metadata: j.metadata,
  customer: j.customer,
  created_at: j.created_at,
}, null, 2));
