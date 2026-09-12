import { isLivePayoutCurrency } from "@/lib/retailPayoutFees";

export const COUNTRY_TO_CURRENCY: Record<string, string> = {
  CA: "CAD",
  US: "USD",
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZM: "ZMW",
  GB: "GBP",
  EU: "EUR",
};

export const CURRENCY_TO_COUNTRY: Record<string, string> = {
  CAD: "CA",
  USD: "US",
  NGN: "NG",
  GHS: "GH",
  KES: "KE",
  ZMW: "ZM",
  GBP: "GB",
  EUR: "EU",
};

export const LINK_COUNTRIES: { code: string; label: string; currency: string }[] = [
  { code: "NG", label: "Nigeria", currency: "NGN" },
  { code: "GH", label: "Ghana", currency: "GHS" },
  { code: "KE", label: "Kenya", currency: "KES" },
  { code: "CA", label: "Canada", currency: "CAD" },
  { code: "US", label: "United States", currency: "USD" },
  { code: "ZM", label: "Zambia", currency: "ZMW" },
  { code: "GB", label: "United Kingdom", currency: "GBP" },
];

export const CORRIDOR_BANK_COUNTRIES = new Set(["NG", "GH", "KE"]);

export type LinkedBankDetails = Record<string, string>;

export type LinkedBank = {
  id: string;
  source: "saved" | "plaid";
  currency: string;
  country: string;
  institution: string;
  lastFour: string;
  displayName: string;
  accountName: string;
  details: LinkedBankDetails;
  /** Plaid live extract — spendable balance when the bank reports it. */
  liveAvailable?: number | null;
  liveCurrent?: number | null;
  liveCurrency?: string | null;
  liveUpdatedAt?: string | null;
  needsReconnect?: boolean;
};

export type BankPayoutSpec = {
  canPayout: boolean;
  railLabel: string;
  payoutMethod: "bank" | "eft";
  transferType: "bank";
  recipientAccount: string;
  recipientBankCode: string;
  recipientBankName: string;
  recipientName: string;
  recipientCountry: string;
  currency: string;
  reason?: string;
};

function str(details: LinkedBankDetails, ...keys: string[]): string {
  for (const k of keys) {
    const v = (details[k] || "").trim();
    if (v) return v;
  }
  return "";
}

export function railLabelFor(country: string, currency: string): string {
  const c = country.toUpperCase();
  if (c === "NG") return "Nigerian bank (Nomba / Flutterwave)";
  if (c === "GH") return "Ghanaian bank (Nomba / Flutterwave)";
  if (c === "KE") return "Kenyan bank";
  if (c === "CA") return "Canadian EFT";
  if (c === "US") return "US ACH / bank payout";
  if (c === "ZM") return "Zambian bank";
  if (c === "GB") return "UK Faster Payments / bank";
  return `${currency} bank payout`;
}

export function payoutSpecFor(bank: LinkedBank): BankPayoutSpec {
  const country = (bank.country || CURRENCY_TO_COUNTRY[bank.currency] || "").toUpperCase();
  const currency = (bank.currency || COUNTRY_TO_CURRENCY[country] || "").toUpperCase();
  const d = bank.details;
  const name = bank.accountName || bank.institution || "Account holder";
  const bankName = str(d, "bank_name") || bank.institution;
  const account = str(d, "account_number", "iban");
  const bankCode = str(d, "bank_code", "routing_number", "sort_code", "institution_number");
  const live = isLivePayoutCurrency(currency);

  const base = {
    transferType: "bank" as const,
    recipientName: name,
    recipientBankName: bankName,
    recipientCountry: country || currency.slice(0, 2),
    currency,
    railLabel: railLabelFor(country, currency),
  };

  if (!live) {
    return {
      ...base,
      canPayout: false,
      payoutMethod: "bank",
      recipientAccount: account,
      recipientBankCode: bankCode,
      reason: `In-country payouts aren't live for ${currency} yet.`,
    };
  }

  if (country === "CA") {
    const inst = str(d, "institution_number");
    const transit = str(d, "transit_number", "branch_number");
    const acct = str(d, "account_number");
    if (!inst || !transit || !acct) {
      return {
        ...base,
        canPayout: false,
        payoutMethod: "eft",
        recipientAccount: acct,
        recipientBankCode: inst,
        reason: "Canadian EFT needs institution, transit, and account numbers.",
      };
    }
    return {
      ...base,
      canPayout: true,
      payoutMethod: "eft",
      recipientAccount: `${inst}-${transit}-${acct}`,
      recipientBankCode: inst,
    };
  }

  if (!account) {
    return {
      ...base,
      canPayout: false,
      payoutMethod: "bank",
      recipientAccount: "",
      recipientBankCode: bankCode,
      reason: "This bank is missing an account number.",
    };
  }

  if ((country === "NG" || country === "GH" || country === "KE") && !bankCode) {
    return {
      ...base,
      canPayout: false,
      payoutMethod: "bank",
      recipientAccount: account,
      recipientBankCode: "",
      reason: "Pick the bank from the list so we can verify the account.",
    };
  }

  return {
    ...base,
    canPayout: true,
    payoutMethod: "bank",
    recipientAccount: account,
    recipientBankCode: bankCode,
  };
}

export function lastFourOf(account: string): string {
  const digits = account.replace(/\s+/g, "");
  return digits.slice(-4) || "0000";
}
