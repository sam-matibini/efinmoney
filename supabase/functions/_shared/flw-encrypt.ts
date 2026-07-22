/**
 * Flutterwave encryption helpers.
 *
 * V3 (legacy Rave): 3DES-ECB with a 24-char key (or key derived from FLW_SECRET_KEY).
 * V4 (company OAuth): AES-256-GCM with a **base64** encryption key from the dashboard.
 *
 * The base64 V4 key is ~44 chars and must NOT be used with 3DES (causes key size 352).
 */
import forge from "https://esm.sh/node-forge@1.3.1";

function cleanEnv(name: string): string {
  return (Deno.env.get(name) || "").trim().replace(/^["']|["']$/g, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function looksLikeBase64Key(value: string): boolean {
  if (value.length < 32) return false;
  if (value.length === 24 && !/[+/=]/.test(value)) return false; // classic V3 24-char key
  try {
    const decoded = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    return decoded.length === 16 || decoded.length === 24 || decoded.length === 32;
  } catch {
    return false;
  }
}

/** Official FLW V3 key derivation from secret key → 24-char 3DES key. */
export function deriveFlwEncryptionKeyFromSecret(secretKey: string): string {
  const seckey = secretKey.trim();
  const md = forge.md.md5.create();
  md.update(seckey);
  const hashedSecKey = md.digest().toHex();
  const hashedSecKeyLast12 = hashedSecKey.slice(-12);
  const seckeyAdjusted = seckey.replace(/^FLWSECK-/, "");
  const seckeyAdjustedFirst12 = seckeyAdjusted.slice(0, 12);
  return `${seckeyAdjustedFirst12}${hashedSecKeyLast12}`;
}

/** V3 24-char Triple-DES key. */
export function getFlwEncryptionKey(): string {
  const fromEnv = cleanEnv("FLW_ENCRYPTION_KEY");
  if (fromEnv.length === 24 && !looksLikeBase64Key(fromEnv)) return fromEnv;

  const secret = cleanEnv("FLW_SECRET_KEY");
  if (secret) return deriveFlwEncryptionKeyFromSecret(secret);
  return fromEnv;
}

/**
 * V4 AES-256 key (base64 from dashboard).
 * Prefers FLW_V4_ENCRYPTION_KEY, else FLW_ENCRYPTION_KEY when it looks like base64.
 */
export function getFlwV4EncryptionKey(): string {
  const dedicated = cleanEnv("FLW_V4_ENCRYPTION_KEY");
  if (dedicated && looksLikeBase64Key(dedicated)) return dedicated;
  const shared = cleanEnv("FLW_ENCRYPTION_KEY");
  if (shared && looksLikeBase64Key(shared)) return shared;
  return "";
}

export function flwV4GenerateNonce(length = 12): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** AES-256-GCM encrypt a single field (Flutterwave V4). */
export async function flwV4EncryptField(
  plainText: string,
  encryptionKeyB64: string,
  nonce: string,
): Promise<string> {
  if (nonce.length !== 12) throw new Error("Nonce must be exactly 12 characters long");
  const keyBytes = Uint8Array.from(atob(encryptionKeyB64), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(`V4 encryption key must decode to 32 bytes (AES-256); got ${keyBytes.length}`);
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = new TextEncoder().encode(nonce);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plainText),
  );
  return bytesToBase64(new Uint8Array(encrypted));
}

export async function flwV4EncryptCardFields(
  fields: { card_number: string; expiry_month: string; expiry_year: string; cvv: string },
  encryptionKeyB64: string,
  nonce?: string,
): Promise<{
  nonce: string;
  encrypted_card_number: string;
  encrypted_expiry_month: string;
  encrypted_expiry_year: string;
  encrypted_cvv: string;
}> {
  const n = nonce || flwV4GenerateNonce(12);
  return {
    nonce: n,
    encrypted_card_number: await flwV4EncryptField(fields.card_number, encryptionKeyB64, n),
    encrypted_expiry_month: await flwV4EncryptField(fields.expiry_month, encryptionKeyB64, n),
    encrypted_expiry_year: await flwV4EncryptField(fields.expiry_year, encryptionKeyB64, n),
    encrypted_cvv: await flwV4EncryptField(fields.cvv, encryptionKeyB64, n),
  };
}

/** Encrypt charge JSON for V3 POST /charges?type=card → body `{ client }`. */
export function flwEncrypt3DesClient(payload: Record<string, unknown>, encryptionKey?: string): string {
  const key = (encryptionKey ?? getFlwEncryptionKey()).trim();
  if (!key) throw new Error("FLW_ENCRYPTION_KEY is not configured");
  if (key.length !== 24) {
    throw new Error(
      `Flutterwave V3 encryption key must be 24 characters (got ${key.length}). ` +
        `Company V4 accounts should use the V4 card path instead.`,
    );
  }

  const text = JSON.stringify(payload);
  const cipher = forge.cipher.createCipher("3DES-ECB", forge.util.createBuffer(key));
  cipher.start({ iv: "" });
  cipher.update(forge.util.createBuffer(text, "utf8"));
  if (!cipher.finish()) throw new Error("Flutterwave 3DES encryption failed");
  return forge.util.encode64(cipher.output.getBytes());
}
