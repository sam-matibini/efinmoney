/**
 * Nomba Checkout rejects merchant / role mailboxes as customerEmail
 * ("Invalid input: The provided email is blocked").
 * Always send a customer-looking address, never the Nomba merchant login.
 */

const ROLE_LOCAL = /^(support|admin|info|hello|ops|finance|billing|noreply|no-reply|accounts|accounting|merchant|nomba)$/i;
const MERCHANT_DOMAINS = new Set([
  "efintax.biz",
  "efintax.ca",
  "efintax.com",
  "nomba.com",
  "nomba.ng",
]);

export function nombaPayerEmail(userId: string): string {
  const id = String(userId || "guest").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "guest";
  return `nomba.${id}@efin.money`;
}

export function isNombaEmailBlockedError(message: string): boolean {
  return /email is blocked|customer email.*(invalid|blocked|not allowed|rejected)/i.test(message);
}

export function resolveNombaCustomerEmail(
  raw: string | null | undefined,
  userId: string,
  extraBlocked: string[] = [],
): { email: string; substituted: boolean } {
  const fallback = nombaPayerEmail(userId);
  const email = String(raw || "").trim().toLowerCase();
  if (!email.includes("@") || email.length > 254) {
    return { email: fallback, substituted: true };
  }
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain || ROLE_LOCAL.test(local) || MERCHANT_DOMAINS.has(domain)) {
    return { email: fallback, substituted: true };
  }
  const blocked = extraBlocked.map((b) => b.trim().toLowerCase()).filter(Boolean);
  if (blocked.includes(email)) {
    return { email: fallback, substituted: true };
  }
  return { email, substituted: false };
}
