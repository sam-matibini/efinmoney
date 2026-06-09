// Sumsub REST signing helpers (shared by edge functions)
// Docs: https://developers.sumsub.com/api-reference/#app-tokens

const APP_TOKEN = Deno.env.get("SUMSUB_APP_TOKEN") ?? "";
const SECRET_KEY = Deno.env.get("SUMSUB_SECRET_KEY") ?? "";
const BASE_URL = "https://api.sumsub.com";

async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sumsubFetch(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string, // must start with /resources/...
  body?: unknown,
): Promise<Response> {
  if (!APP_TOKEN || !SECRET_KEY) {
    throw new Error("Missing SUMSUB_APP_TOKEN or SUMSUB_SECRET_KEY");
  }
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body));
  const signature = await hmacSha256Hex(SECRET_KEY, ts + method + path + bodyStr);
  return await fetch(BASE_URL + path, {
    method,
    headers: {
      "X-App-Token": APP_TOKEN,
      "X-App-Access-Ts": ts,
      "X-App-Access-Sig": signature,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: bodyStr || undefined,
  });
}

export async function verifySumsubWebhook(
  rawBody: string,
  signatureHex: string,
  alg: string,
): Promise<boolean> {
  if (!SECRET_KEY || !signatureHex) return false;
  const hashName = (alg || "HMAC_SHA256_HEX").toUpperCase();
  let hash: "SHA-1" | "SHA-256" | "SHA-512" = "SHA-256";
  if (hashName.includes("SHA1")) hash = "SHA-1";
  else if (hashName.includes("SHA512")) hash = "SHA-512";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET_KEY),
    { name: "HMAC", hash },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed.toLowerCase() === signatureHex.toLowerCase();
}
