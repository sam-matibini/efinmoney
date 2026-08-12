/**
 * Nigerian bank code aliases across Flovide / Fincra / Nomba / Flutterwave.
 * Prefer matching by bank name when possible; codes differ by provider.
 */

const ALIASES: Array<{ names: string[]; codes: string[] }> = [
  { names: ["opay", "paycom", "opeyemi"], codes: ["100004", "305", "999992"] },
  { names: ["palmpay", "palm pay"], codes: ["100033", "999991"] },
  { names: ["kuda"], codes: ["090267", "50211"] },
  { names: ["moniepoint", "monie point"], codes: ["090405", "50515"] },
];

export function normalizeNgCountry(country?: string | null, currency?: string | null): string {
  const raw = String(country || "").trim().toUpperCase();
  if (raw === "NG" || raw === "NIGERIA") return "NG";
  if (raw === "NGN" || String(currency || "").toUpperCase() === "NGN") return "NG";
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw || (String(currency || "").toUpperCase() === "NGN" ? "NG" : "");
}

/** Expand a code or name into every known alias code for matching. */
export function ngBankCodeCandidates(code: string, bankName?: string | null): string[] {
  const c = String(code || "").trim();
  const name = String(bankName || "").toLowerCase();
  const out = new Set<string>();
  if (c) out.add(c);

  for (const row of ALIASES) {
    const hitCode = row.codes.includes(c);
    const hitName = name && row.names.some((n) => name.includes(n));
    if (hitCode || hitName) {
      for (const x of row.codes) out.add(x);
    }
  }
  return [...out];
}

/**
 * Pick the best bank code from a provider bank list given stored code + name.
 */
export function resolveProviderBankCode(
  banks: Array<{ code: string; name: string }>,
  storedCode: string,
  storedName?: string | null,
): { code: string; matchedBy: "code" | "name" | "alias" | "none"; name?: string } {
  const code = String(storedCode || "").trim();
  const name = String(storedName || "").trim().toLowerCase();
  if (!banks.length) {
    return { code, matchedBy: code ? "code" : "none" };
  }

  const byCode = banks.find((b) => b.code === code);
  if (byCode) return { code: byCode.code, matchedBy: "code", name: byCode.name };

  const candidates = ngBankCodeCandidates(code, storedName);
  const byAlias = banks.find((b) => candidates.includes(b.code));
  if (byAlias) return { code: byAlias.code, matchedBy: "alias", name: byAlias.name };

  if (name) {
    const byName = banks.find((b) => {
      const bn = b.name.toLowerCase();
      return bn === name || bn.includes(name) || name.includes(bn);
    });
    if (byName) return { code: byName.code, matchedBy: "name", name: byName.name };
  }

  return { code, matchedBy: code ? "code" : "none" };
}
