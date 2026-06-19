const ENC_ALGO = "AES-GCM";
const IV_BYTES = 12;

function getKeyMaterial(): string {
  const key = (Deno.env.get("CARD_SECRETS_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!key) throw new Error("CARD_SECRETS_KEY is not configured");
  return key;
}

async function deriveKey(): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(getKeyMaterial());
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", hash, { name: ENC_ALGO }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await deriveKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = await crypto.subtle.encrypt(
    { name: ENC_ALGO, iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${toB64(iv)}:${toB64(new Uint8Array(enc))}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [ivB64, dataB64] = payload.split(":");
  if (!ivB64 || !dataB64) throw new Error("Invalid encrypted payload");
  const key = await deriveKey();
  const dec = await crypto.subtle.decrypt(
    { name: ENC_ALGO, iv: fromB64(ivB64) },
    key,
    fromB64(dataB64),
  );
  return new TextDecoder().decode(dec);
}

export function generatePan(network: "visa" | "mastercard"): string {
  const prefix = network === "visa" ? "4" : "5" + Math.floor(1 + Math.random() * 5);
  let body = prefix;
  while (body.length < 15) body += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = parseInt(body[body.length - 1 - i], 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  const check = (10 - (sum % 10)) % 10;
  return body + check;
}

export function generateCvv(): string {
  return String(Math.floor(100 + Math.random() * 900));
}
