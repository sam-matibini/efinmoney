import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, ".paytota.env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const BASE = (process.env.PAYTOTA_BASE_URL || "https://gate.paytota.com").replace(/\/+$/, "");
const SECRET = process.env.PAYTOTA_SECRET_KEY;
const BRAND = process.env.PAYTOTA_BRAND_ID;
if (!SECRET || !BRAND) {
  console.error("Missing Paytota creds");
  process.exit(1);
}

async function hit(label, body) {
  const res = await fetch(`${BASE}/api/v1/purchases/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  console.log(`\n=== ${label} HTTP ${res.status} ===`);
  console.log(raw.slice(0, 1800));
}

const ref = `efin-kes-probe-${Date.now()}`;

await hit("KES + KE phone + whitelist", {
  client: { email: "test@efin.money", phone: "254790123456", country: "KE" },
  purchase: { currency: "KES", products: [{ name: "probe", price: 1049 }] },
  reference: `${ref}-a`,
  skip_capture: false,
  brand_id: BRAND,
  payment_method_whitelist: ["mpesa", "airtel"],
  success_redirect: "https://www.efin.money/wallet/topup?paytota=success",
  failure_redirect: "https://www.efin.money/wallet/topup?paytota=failed",
});

await hit("KES + UG phone (user case)", {
  client: { email: "test@efin.money", phone: "256779735042", country: "KE" },
  purchase: { currency: "KES", products: [{ name: "probe", price: 1049 }] },
  reference: `${ref}-b`,
  skip_capture: false,
  brand_id: BRAND,
  payment_method_whitelist: ["mpesa", "airtel"],
});

await hit("KES no whitelist", {
  client: { email: "test@efin.money", phone: "254790123456", country: "KE" },
  purchase: { currency: "KES", products: [{ name: "probe", price: 1049 }] },
  reference: `${ref}-c`,
  skip_capture: false,
  brand_id: BRAND,
});

await hit("KES price as string", {
  client: { email: "test@efin.money", phone: "254790123456", country: "KE" },
  purchase: { currency: "KES", products: [{ name: "probe", price: "1049" }] },
  reference: `${ref}-d`,
  skip_capture: false,
  brand_id: BRAND,
  payment_method_whitelist: ["mpesa"],
});

await hit("UGX control", {
  client: { email: "test@efin.money", phone: "256779735042", country: "UG" },
  purchase: { currency: "UGX", products: [{ name: "probe", price: "500" }] },
  reference: `${ref}-e`,
  skip_capture: false,
  brand_id: BRAND,
  payment_method_whitelist: ["airtel", "mtnmomo"],
});
