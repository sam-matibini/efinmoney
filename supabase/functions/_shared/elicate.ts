// Resolves Elicate environment (live vs sandbox) at runtime so we can flip
// without redeploying. Set ELICATE_ENV=live to use production credentials.
const CHARGE_PATH = "/api/v1/payments/charge";
export const SANDBOX_ELICATE_URL = `https://elicatepay.vercel.app${CHARGE_PATH}`;

export interface ElicateConfig {
  mode: "live" | "sandbox";
  url: string;
  secretKey: string | undefined;
  publicKey: string | undefined;
  webhookSecret: string | undefined;
}

// Tolerate URLs entered as a bare host, dashboard page, or with trailing slash.
// Always resolve to the canonical charge endpoint.
function normalizeChargeUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const parsed = new URL(u);
    if (!parsed.pathname || parsed.pathname === "/" || !parsed.pathname.includes("/api/")) {
      parsed.pathname = CHARGE_PATH;
    }
    return parsed.toString();
  } catch {
    return u;
  }
}

export function getElicateConfig(): ElicateConfig {
  const envRaw = (Deno.env.get("ELICATE_ENV") ?? "").trim().toLowerCase();
  const liveUrlRaw = Deno.env.get("ELICATE_LIVE_BASE_URL");
  const liveKey = Deno.env.get("ELICATE_LIVE_SECRET_KEY");
  const liveCredsPresent = Boolean(liveUrlRaw && liveKey);

  const forceSandbox = envRaw === "sandbox" || envRaw === "test";
  const explicitLive = ["live", "production", "prod", "1", "true"].includes(envRaw);
  const isLive = !forceSandbox && (explicitLive || liveCredsPresent);

  if (isLive) {
    return {
      mode: "live",
      url: liveUrlRaw ? normalizeChargeUrl(liveUrlRaw) : "",
      secretKey: liveKey,
      publicKey: Deno.env.get("ELICATE_LIVE_PUBLIC_KEY"),
      webhookSecret: Deno.env.get("ELICATE_LIVE_WEBHOOK_SECRET"),
    };
  }
  return {
    mode: "sandbox",
    url: SANDBOX_ELICATE_URL,
    secretKey: Deno.env.get("ELICATE_SECRET_KEY"),
    publicKey: Deno.env.get("ELICATE_PUBLIC_KEY"),
    webhookSecret: Deno.env.get("ELICATE_WEBHOOK_SECRET"),
  };
}
