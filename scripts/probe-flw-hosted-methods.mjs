/**
 * Create USD/CAD hosted links and check if page says "No Payment method available".
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const envp = join(dir, ".flw-probe.env");
if (existsSync(envp)) {
  for (const line of readFileSync(envp, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!m) continue;
    process.env[m[1].trim()] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const sk = process.env.FLW_SECRET_KEY;
if (!sk) {
  console.error("Missing FLW_SECRET_KEY");
  process.exit(1);
}

async function init(currency) {
  const res = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sk}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tx_ref: `efm_ui_${currency}_${Date.now()}`,
      amount: "5",
      currency,
      redirect_url: "https://www.efin.money/wallet/topup?flw_probe=1",
      payment_options: "card",
      customer: { email: "corridor-probe@efin.money", name: "eFin Probe" },
      customizations: { title: `eFin ${currency} probe` },
    }),
  });
  const j = await res.json();
  return { status: j.status, message: j.message, link: j.data?.link };
}

for (const c of ["USD", "CAD"]) {
  const r = await init(c);
  console.log(`\n=== ${c} === ${r.status} — ${r.message}`);
  console.log("link:", r.link || "(none)");
  if (!r.link) continue;
  const html = await fetch(r.link).then((x) => x.text());
  console.log("no payment method?", /no payment method/i.test(html));
  console.log("title:", (html.match(/<title>[^<]+/i) || [])[0] || "(none)");
  const hit =
    html.match(/No Payment method available[^<]*/i) ||
    html.match(/payment method[^<"]{0,100}/i);
  if (hit) console.log("match:", hit[0].slice(0, 140));
}
