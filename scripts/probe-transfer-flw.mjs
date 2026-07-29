#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, "..");

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(resolve(root, ".env"));
loadEnv(resolve(root, "migration-export/secrets.env"));

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const transferId = process.argv[2] || "81e298a3-9a6a-4109-a9e3-431b579ab806";

const cols =
  "id,status,failure_reason,provider_reference,payout_method,source_currency,target_currency,source_amount,target_amount,recipient_name,recipient_account,recipient_bank_code,recipient_phone,created_at,updated_at";

async function main() {
  if (service) {
    const admin = createClient(url, service);
    const { data, error } = await admin.from("transfers").select(cols).eq("id", transferId).maybeSingle();
    console.log("=== service role transfer ===");
    console.log(JSON.stringify({ data, error }, null, 2));
  } else {
    console.log("No SUPABASE_SERVICE_ROLE_KEY in secrets.env — trying user login");
  }

  // Sign in as staff user if credentials present
  const email = process.env.PROBE_EMAIL || "ukwenzyb@gmail.com";
  const password = process.env.PROBE_PASSWORD || process.env.SWYCHR_PASSWORD || "Winnipeg@2026";
  const userSb = createClient(url, anon);
  const { data: auth, error: authErr } = await userSb.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.log("auth failed", authErr.message);
    return;
  }
  console.log("authed as", auth.user?.email);

  const { data, error } = await userSb.from("transfers").select(cols + ", meta").eq("id", transferId).maybeSingle();
  console.log("=== user transfer ===");
  console.log(JSON.stringify({ data, error }, null, 2));

  // Check FLW transfer status if we have a provider ref
  const ref = data?.provider_reference;
  const secret = process.env.FLW_SECRET_KEY;
  const proxy = (process.env.FLW_PROXY_URL || "https://efin-flw-proxy.ukwenzyb.workers.dev").replace(/\/+$/, "");
  if (ref && secret) {
    console.log("\n=== FLW V3 transfer lookup ===", ref);
    const r = await fetch(`${proxy}/v3/transfers?reference=${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    });
    console.log(r.status, (await r.text()).slice(0, 1200));

    const r2 = await fetch(`${proxy}/v3/transfers/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    });
    console.log("by id", r2.status, (await r2.text()).slice(0, 1200));
  }

  // Also list recent transfers for this user
  const { data: recent } = await userSb
    .from("transfers")
    .select("id,status,failure_reason,provider_reference,target_amount,target_currency,created_at")
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("\n=== recent transfers ===");
  console.log(JSON.stringify(recent, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
