// Resolves Elicate environment (live vs sandbox) at runtime so we can flip
// without redeploying. Set ELICATE_ENV=live to use production credentials.
//
// Two distinct endpoints:
//   * CHARGE  — pull funds FROM a customer's wallet (collections).
//   * PAYOUT  — push funds TO a beneficiary's wallet (disbursements).
// Paths can be overridden via ELICATE_CHARGE_PATH / ELICATE_PAYOUT_PATH if
// Elicate changes them later.
const DEFAULT_CHARGE_PATH = "/api/v1/payments/charge";
const DEFAULT_PAYOUT_PATH = "/api/v1/payouts";
const SANDBOX_HOST = "https://elicatepay.vercel.app";

export const SANDBOX_ELICATE_URL = `${SANDBOX_HOST}${DEFAULT_CHARGE_PATH}`;

export interface ElicateConfig {
  mode: "live" | "sandbox";
  /** Charge (collection) endpoint — pulls money FROM a customer. */
  chargeUrl: string;
  /** Payout (disbursement) endpoint — pushes money TO a beneficiary. */
  payoutUrl: string;
  /** @deprecated retained for back-compat; equals chargeUrl. */
  url: string;
  secretKey: string | undefined;
  publicKey: string | undefined;
  webhookSecret: string | undefined;
}

// Tolerate URLs entered as a bare host, dashboard page, or with trailing slash.
// Returns the host root (no path) so we can append the right action path.
function normalizeHost(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return u;
  }
}

function joinPath(host: string, path: string): string {
  if (!host) return "";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${host}${cleanPath}`;
}

export function getElicateConfig(): ElicateConfig {
  const envRaw = (Deno.env.get("ELICATE_ENV") ?? "").trim().toLowerCase();
  const liveUrlRaw = Deno.env.get("ELICATE_LIVE_BASE_URL");
  const liveKey = Deno.env.get("ELICATE_LIVE_SECRET_KEY");
  const liveCredsPresent = Boolean(liveUrlRaw && liveKey);

  const forceSandbox = envRaw === "sandbox" || envRaw === "test";
  const explicitLive = ["live", "production", "prod", "1", "true"].includes(envRaw);
  const isLive = !forceSandbox && (explicitLive || liveCredsPresent);

  const chargePath = (Deno.env.get("ELICATE_CHARGE_PATH") || DEFAULT_CHARGE_PATH).trim();
  const payoutPath = (Deno.env.get("ELICATE_PAYOUT_PATH") || DEFAULT_PAYOUT_PATH).trim();

  const host = isLive
    ? (liveUrlRaw ? normalizeHost(liveUrlRaw) : "")
    : SANDBOX_HOST;

  const chargeUrl = joinPath(host, chargePath);
  const payoutUrl = joinPath(host, payoutPath);

  return {
    mode: isLive ? "live" : "sandbox",
    chargeUrl,
    payoutUrl,
    url: chargeUrl,
    secretKey: isLive ? liveKey : Deno.env.get("ELICATE_SECRET_KEY"),
    publicKey: isLive ? Deno.env.get("ELICATE_LIVE_PUBLIC_KEY") : Deno.env.get("ELICATE_PUBLIC_KEY"),
    webhookSecret: isLive ? Deno.env.get("ELICATE_LIVE_WEBHOOK_SECRET") : Deno.env.get("ELICATE_WEBHOOK_SECRET"),
  };
}
