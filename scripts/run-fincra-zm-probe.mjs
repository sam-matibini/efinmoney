/**
 * Invoke fincra-zm-probe after you deploy it from Owner CLI.
 * Usage: node scripts/run-fincra-zm-probe.mjs
 */
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = (env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or publishable key in .env");
  process.exit(1);
}

const doPayout = process.argv.includes("--payout");
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const maxAttempts = maxArg ? Number(maxArg.split("=")[1]) : 4;

const body = {
  probe_key: "efm-zm-fincra-7f3a9c",
  phone: "260770069550",
  amount: 5,
  do_payout: doPayout,
  max_attempts: maxAttempts,
  networks: ["AIRTEL", "MTN", "ZAMTEL"],
  source_currency: "NGN",
};

console.log(
  doPayout
    ? `Running LIVE payout probe (up to ${maxAttempts} attempts; each may charge ~₦2.6k incl. fee)…`
    : "Running resolve-only probe…",
);

const res = await fetch(`${url}/functions/v1/fincra-zm-probe`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
    apikey: key,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("HTTP", res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
