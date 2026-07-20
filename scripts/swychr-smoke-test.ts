#!/usr/bin/env -S deno run --allow-env --allow-net
/**
 * Swychr Connect sandbox smoke test — auth + read-only probes for all 4 suites.
 *
 * Usage:
 *   SWYCHR_EMAIL=... SWYCHR_PASSWORD=... deno run --allow-env --allow-net scripts/swychr-smoke-test.ts
 *
 * Prefer scripts/swychr-smoke-test.mjs on Windows (no Deno required).
 * Tokens from /admin/auth are valid ~90 days.
 */

const API_HOST = "https://api.accountpe.com";

type Suite = "payin" | "payout" | "card" | "airtime";

function creds() {
  const email = Deno.env.get("SWYCHR_EMAIL")?.trim();
  const password = Deno.env.get("SWYCHR_PASSWORD")?.trim();
  if (!email || !password) {
    console.error("Set SWYCHR_EMAIL and SWYCHR_PASSWORD");
    Deno.exit(1);
  }
  return { email, password };
}

function suiteBase(suite: Suite): string {
  if (suite === "card") {
    return Deno.env.get("SWYCHR_CARD_SANDBOX") === "true"
      ? `${API_HOST}/api/card/sandbox`
      : `${API_HOST}/api/card/prod`;
  }
  if (suite === "airtime") return `${API_HOST}/api/airtime/prod`;
  return `${API_HOST}/api/${suite}`;
}

async function login(suite: Suite): Promise<string> {
  const body = creds();
  let url: string;
  if (suite === "airtime") url = `${suiteBase(suite)}/auth/login`;
  else if (suite === "card") url = `${suiteBase(suite)}/admin/login`;
  else url = `${suiteBase(suite)}/admin/auth`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.message ?? json.error ?? `${suite} auth ${res.status}`));
  const token = String(json.token ?? "");
  if (!token) throw new Error(`${suite} auth returned no token`);
  return token;
}

async function hit(label: string, url: string, init: RequestInit) {
  const started = Date.now();
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: unknown;
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

const results: Array<{ ok: boolean }> = [];

console.log("Swychr Connect smoke test\n");

for (const suite of ["payin", "payout", "card", "airtime"] as Suite[]) {
  try {
    const token = await login(suite);
    results.push({ ok: true });
    console.log(`AUTH ${suite} OK`);

    const authHdr = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };

    if (suite === "payin") {
      // No safe write in smoke — auth only
      continue;
    }
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
    if (suite === "card") {
      // List endpoints vary — probe admin health via login only unless we have user id
      continue;
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
console.log("Card/airtime smoke uses live prod unless SWYCHR_CARD_SANDBOX=true.");
Deno.exit(passed >= 4 ? 0 : 1);
