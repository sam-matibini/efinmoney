// Local email validation: strict format + common-domain typo correction +
// disposable-domain blocklist. No network calls, no API key.

export interface EmailCheckResult {
  valid: boolean;
  message?: string;
  suggestion?: string; // corrected email if a common typo was detected
}

// Conservative RFC-5321-ish format check.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Common misspellings of top email providers → correct domain.
const DOMAIN_TYPOS: Record<string, string> = {
  // gmail
  "gmial.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmaiil.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.con": "gmail.com",
  "gmailcom": "gmail.com",
  "gmailcom.com": "gmail.com",
  "gmail.net": "gmail.com",
  // yahoo
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yhoo.com": "yahoo.com",
  "yhooo.com": "yahoo.com",
  // hotmail
  "hotnail.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.cm": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  // outlook / live
  "outloo.com": "outlook.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.cm": "outlook.com",
  "outlook.con": "outlook.com",
  "outlookcom": "outlook.com",
  // icloud
  "iclould.com": "icloud.com",
  "iclod.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.cm": "icloud.com",
  "icloud.con": "icloud.com",
  // proton
  "protonmai.com": "proton.me",
  "protonmail.com": "proton.me",
  "proton.co": "proton.me",
  "proton.com": "proton.me",
  // aol
  "aol.co": "aol.com",
  "aol.cm": "aol.com",
};

const DISPOSABLE_DOMAINS = new Set<string>([
  "mailinator.com",
  "mailinator.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamail.biz",
  "10minutemail.com",
  "10minutemail.net",
  "10minutemail.org",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "throwawaymail.com",
  "fakeinbox.com",
  "maildrop.cc",
  "getnada.com",
  "sharklasers.com",
  "mailnesia.com",
  "trashmail.com",
  "trashmail.net",
  "trashmail.org",
  "mailcatch.com",
  "dispostable.com",
  "mintemail.com",
  "spamgourmet.com",
  "spam4.me",
  "filzmail.com",
  "wegwerfmail.com",
  "wegwerfemail.de",
  "tempinbox.com",
  "tempmailer.com",
  "jetable.org",
  "meltmail.com",
  "mohmal.com",
  "emailondeck.com",
  "emailfake.com",
  "discard.email",
  "discardmail.com",
  "tempemail.com",
  "tempmailaddress.com",
  "burnermail.io",
  "minutemail.com",
  "inboxbear.com",
  "spamfree24.org",
  "spambox.us",
  "tempmailo.com",
  "mvrht.com",
  "mailpoof.com",
  "harakirimail.com",
]);

const KNOWN_GOOD_DOMAINS = new Set<string>([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "gmx.de",
  "yandex.com",
  "yandex.ru",
  "zoho.com",
  "fastmail.com",
  "tutanota.com",
  "tutamail.com",
]);

function suggestDomain(domain: string): string | null {
  const lower = domain.toLowerCase();
  if (DOMAIN_TYPOS[lower]) return DOMAIN_TYPOS[lower];
  // Don't try to suggest for unusual domains — risk of being wrong.
  if (KNOWN_GOOD_DOMAINS.has(lower)) return null;
  return null;
}

export function verifyEmail(email: string): Promise<EmailCheckResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return Promise.resolve({ valid: false, message: "Email is required." });
  }
  if (!EMAIL_RE.test(trimmed)) {
    return Promise.resolve({
      valid: false,
      message: "Please enter a valid email address.",
    });
  }

  const [localPart, domain] = trimmed.toLowerCase().split("@");

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return Promise.resolve({
      valid: false,
      message: "Disposable email addresses aren't allowed.",
    });
  }

  const suggestedDomain = suggestDomain(domain);
  if (suggestedDomain && suggestedDomain !== domain) {
    return Promise.resolve({
      valid: false,
      message: "This email address doesn't look right.",
      suggestion: `${localPart}@${suggestedDomain}`,
    });
  }

  return Promise.resolve({ valid: true });
}
