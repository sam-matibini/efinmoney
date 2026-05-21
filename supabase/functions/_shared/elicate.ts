// Resolves Elicate environment (live vs sandbox) at runtime so we can flip
// without redeploying. Set ELICATE_ENV=live to use production credentials.
export const SANDBOX_ELICATE_URL =
  "https://elicatepay.vercel.app/api/v1/payments/charge";

export interface ElicateConfig {
  mode: "live" | "sandbox";
  url: string;
  secretKey: string | undefined;
  publicKey: string | undefined;
  webhookSecret: string | undefined;
}

export function getElicateConfig(): ElicateConfig {
  const envRaw = (Deno.env.get("ELICATE_ENV") ?? "").trim().toLowerCase();
  const liveUrl = Deno.env.get("ELICATE_LIVE_BASE_URL");
  const liveKey = Deno.env.get("ELICATE_LIVE_SECRET_KEY");
  const liveCredsPresent = Boolean(liveUrl && liveKey);

  // Explicit sandbox override always wins.
  const forceSandbox = envRaw === "sandbox" || envRaw === "test";
  // Treat any of these as "live", and also auto-promote to live when
  // live credentials exist and the env isn't explicitly sandbox.
  const explicitLive = ["live", "production", "prod", "1", "true"].includes(envRaw);
  const isLive = !forceSandbox && (explicitLive || liveCredsPresent);

  if (isLive) {
    return {
      mode: "live",
      url: liveUrl ?? "",
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
