#!/usr/bin/env node
/**
 * Swychr Connect smoke test — auth + read-only probes (Node, no Deno required).
 *
 * Usage (PowerShell):
 *   $env:SWYCHR_EMAIL="..."; $env:SWYCHR_PASSWORD="..."; node scripts/swychr-smoke-test.mjs
 *
 * Or put vars in scripts/.swychr.env (see .swychr.env.example).
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dirname, ".swychr.env");

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

const API_HOST = "https://api.accountpe.com";

function creds() {
  const email = process.env.SWYCHR_EMAIL?.trim();
  const password = process.env.SWYCHR_PASSWORD?.trim();
  if (!email || !password) {
    console.error("Missing SWYCHR_EMAIL / SWYCHR_PASSWORD.");
    console.error("Set them in the environment or copy scripts/.swychr.env.example → scripts/.swychr.env");
    process.exit(1);
  }
  return { email, password };
}

function suiteBase(suite) {
  if (suite === "card") {
    return process.env.SWYCHR_CARD_SANDBOX === "true"
      ? `${API_HOST}/api/card/sandbox`
      : `${API_HOST}/api/card/prod`;
  }
  if (suite === "airtime") return `${API_HOST}/api/airtime/prod`;
  return `${API_HOST}/api/${suite}`;
}

function extractToken(json) {
  if (!json || typeof json !== "object") return "";
  if (typeof json.token === "string" && json.token) return json.token;
  if (typeof json.access_token === "string" && json.access_token) return json.access_token;
  if (json.data && typeof json.data === "object" && typeof json.data.token === "string") {
    return json.data.token;
  }
  return "";
}

async function login(suite) {
  const body = creds();
  let url;
  if (suite === "airtime") url = `${suiteBase(suite)}/auth/login`;
  else if (suite === "card") url = `${suiteBase(suite)}/admin/login`;
  else url = `${suiteBase(suite)}/admin/auth`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(json.message ?? json.error ?? `${suite} auth ${res.status}`));
  }
  const token = extractToken(json);
  if (!token) throw new Error(`${suite} auth returned no token: ${JSON.stringify(json).slice(0, 200)}`);
  return token;
}

async function hit(label, url, init) {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
    const ok = res.ok;
    console.log(`${ok ? "OK" : "FAIL"} ${label} [${res.status}] ${Date.now() - started}ms`);
    if (!ok) console.log("  ", JSON.stringify(json).slice(0, 300));
    return { ok, status: res.status, json };
  } catch (e) {
    console.log(`ERR ${label}:`, e instanceof Error ? e.message : e);
    return { ok: false, error: String(e) };
  }
}

const results = [];
console.log("Swychr Connect smoke test (90-day bearer via /admin/auth)\n");

for (const suite of ["payin", "payout", "card", "airtime"]) {
  try {
    const token = await login(suite);
    results.push({ ok: true });
    console.log(`AUTH ${suite} OK (token length ${token.length})`);

    const authHdr = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (suite === "payout") {
      results.push(await hit("GET nigeria_banks", `${suiteBase(suite)}/nigeria_banks`, {
        method: "GET",
        headers: authHdr,
      }));
      results.push(await hit("POST payout_methods NG", `${suiteBase(suite)}/payout_methods`, {
        method: "POST",
        headers: authHdr,
        body: JSON.stringify({ country: "NG" }),
      }));
    }
    if (suite === "airtime") {
      results.push(await hit("POST operators NG", `${suiteBase(suite)}/operators/list`, {
        method: "POST",
        headers: authHdr,
        body: JSON.stringify({ country: "NG" }),
      }));
      results.push(await hit("POST products NG", `${suiteBase(suite)}/products/by-country`, {
        method: "POST",
        headers: authHdr,
        body: JSON.stringify({ country: "NG" }),
      }));
    }
  } catch (e) {
    console.log(`FAIL ${suite}:`, e instanceof Error ? e.message : e);
    results.push({ ok: false });
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} checks passed.`);
console.log("Keep VITE_FEATURE_SWYCHR=false until sandbox E2E is verified.");
process.exit(passed >= 2 ? 0 : 1);
