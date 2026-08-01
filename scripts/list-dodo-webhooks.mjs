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
const res = await fetch("https://live.dodopayments.com/webhooks", {
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
});
const j = await res.json();
const list = j.data || j.items || [];
for (const w of list) {
  console.log({
    id: w.id,
    url: w.url,
    disabled: w.disabled,
    filter_types: w.filter_types,
  });
}
const good = list.some((w) =>
  String(w.url || "").includes("dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/dodo-webhook"),
);
console.log(good ? "\nOK: Supabase webhook URL is registered" : "\nWARN: No webhook points at Supabase dodo-webhook yet");
