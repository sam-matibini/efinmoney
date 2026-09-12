/**
 * Nomba Checkout rejects merchant / role mailboxes as customerEmail
 * ("Invalid input: The provided email is blocked").
 * Always send a customer-looking address, never the Nomba merchant login,
 * never @efin.money (that domain is on Nomba's block list).
 */

const ROLE_LOCAL = /^(support|admin|info|hello|ops|finance|billing|noreply|no-reply|accounts|accounting|merchant|nomba)$/i;
const MERCHANT_DOMAINS = new Set([
  "efin.money",
  "www.efin.money",
  "efintax.biz",
  "efintax.ca",
  "efintax.com",
  "nomba.com",
  "nomba.ng",
]);

/** Domain we send FROM (Resend) — not the merchant login domain Nomba blocks. */
const PAYER_DOMAIN = "efinsuite.com";

export function nombaPayerEmail(userId: string, domain = PAYER_DOMAIN): string {
  const id = String(userId || "guest").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "guest";
  return `payer.${id}@${domain}`;
}

export function nombaPayerEmailFallbacks(userId: string): string[] {
  const id = String(userId || "guest").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "guest";
  return [
    `payer.${id}@${PAYER_DOMAIN}`,
    `checkout.${id}@${PAYER_DOMAIN}`,
  ];
}

export function isNombaEmailBlockedError(message: string): boolean {
  return /email is blocked|customer email.*(invalid|blocked|not allowed|rejected)/i.test(message);
}

function uniqueEmails(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const email = String(raw || "").trim().toLowerCase();
    if (!email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
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
  const platformLocal = !local || ROLE_LOCAL.test(local) || local.startsWith("nomba.");
  if (platformLocal || MERCHANT_DOMAINS.has(domain)) {
    return { email: fallback, substituted: true };
  }
  const blocked = extraBlocked.map((b) => b.trim().toLowerCase()).filter(Boolean);
  if (blocked.includes(email)) {
    return { email: fallback, substituted: true };
  }
  return { email, substituted: false };
}

/** Ordered unique emails to try on Nomba Checkout until one is accepted. */
export function nombaCheckoutEmailCandidates(
  raw: string | null | undefined,
  userId: string,
  extraBlocked: string[] = [],
): string[] {
  const resolved = resolveNombaCustomerEmail(raw, userId, extraBlocked).email;
  return uniqueEmails([resolved, ...nombaPayerEmailFallbacks(userId)]);
}
