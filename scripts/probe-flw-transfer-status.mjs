#!/usr/bin/env node
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

const secret = process.env.FLW_SECRET_KEY;
const proxy = (process.env.FLW_PROXY_URL || "https://efin-flw-proxy.ukwenzyb.workers.dev").replace(/\/+$/, "");
const ref = process.argv[2] || "efin-flw-ngn-ms68ts7c";

const r = await fetch(`${proxy}/v3/transfers?reference=${encodeURIComponent(ref)}`, {
  headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
});
console.log(r.status, (await r.text()).slice(0, 2000));
