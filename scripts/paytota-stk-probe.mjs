/**
 * Probe UGX MoMo collection STK (create + execute).
 * Usage: node scripts/paytota-stk-probe.mjs
 * Loads scripts/.paytota.env
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, "scripts/.paytota.env");
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([^#=]+)=(.*)$/);
  if (!m) continue;
  process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, "");
}

const BASE = (process.env.PAYTOTA_BASE_URL || "https://gate.paytota.com").replace(/\/+$/, "");
const SK = process.env.PAYTOTA_SECRET_KEY;
const BID = process.env.PAYTOTA_BRAND_ID;
const PHONE = process.env.PAYTOTA_TEST_PHONE || "256779735042";

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SK}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  return { status: res.status, headers: Object.fromEntries(res.headers), json, raw };
}

async function execForm(id, withPhone) {
  const form = new FormData();
  form.append("s2s", "true");
  form.append("pm", "paytota_proxy");
  if (withPhone) form.append("phone", PHONE);
  const res = await fetch(`${BASE}/p/${id}/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SK}`,
      Accept: "application/json",
    },
    body: form,
    redirect: "manual",
  });
  const raw = await res.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = { raw };
  }
  return {
    status: res.status,
    location: res.headers.get("location"),
    json,
    raw: raw.slice(0, 500),
  };
}

function summarize(label, create) {
  const attempts = create.json?.transaction_data?.attempts ?? [];
  console.log(`\n=== ${label} ===`);
  console.log("HTTP", create.status, "id", create.json?.id, "status", create.json?.status, "is_test", create.json?.is_test);
  console.log("checkout_url", create.json?.checkout_url);
  console.log("whitelist", create.json?.payment_method_whitelist);
  console.log("attempts", JSON.stringify(attempts, null, 2));
}

const baseBody = {
  client: { email: "ukwenzyb@gmail.com", phone: PHONE, country: "UG" },
  purchase: { currency: "UGX", products: [{ name: "STK probe", price: "500" }] },
  skip_capture: false,
  brand_id: BID,
  success_redirect: "https://www.efin.money/wallet/topup?paytota=success",
  failure_redirect: "https://www.efin.money/wallet/topup?paytota=failed",
  success_callback: "https://dkdnwumllibwdlqbjkwy.functions.supabase.co/paytota-webhook",
};

const a = await api("POST", "/api/v1/purchases/", {
  ...baseBody,
  reference: `efin-stk-nw-${Date.now()}`,
});
summarize("CREATE no whitelist", a);

const b = await api("POST", "/api/v1/purchases/", {
  ...baseBody,
  reference: `efin-stk-wl-${Date.now()}`,
  payment_method_whitelist: ["airtel", "mtnmomo"],
});
summarize("CREATE with whitelist", b);

for (const [label, id] of [
  ["no-whitelist", a.json?.id],
  ["whitelist", b.json?.id],
]) {
  if (!id) continue;
  const ex = await execForm(id, true);
  console.log(`\n=== EXECUTE ${label} +phone ===`);
  console.log(JSON.stringify(ex, null, 2));
}

// User's invoice purchase
const uid = "2f96d320-d3b1-4925-b347-03a354f307b3";
const u = await api("GET", `/api/v1/purchases/${uid}/`);
console.log("\n=== USER INVOICE PURCHASE ===");
console.log("status", u.json?.status, "is_test", u.json?.is_test);
console.log("checkout", u.json?.checkout_url);
console.log("whitelist", u.json?.payment_method_whitelist);
console.log("attempts", JSON.stringify(u.json?.transaction_data?.attempts ?? [], null, 2));
console.log("status_history", JSON.stringify(u.json?.status_history ?? [], null, 2));
const uex = await execForm(uid, true);
console.log("execute that purchase:", JSON.stringify(uex, null, 2));
