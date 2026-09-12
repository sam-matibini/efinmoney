import { isLivePayoutCurrency } from "./retailPayoutFees.ts";
import { CAD_BANK_EFT_ENABLED, INTERAC_ETRANSFER_ENABLED } from "./canadaPayoutRails.ts";
import {
  CAD_INTERAC_MISSING_CONTACT,
  resolveCadInteracDestination,
} from "./cadInteracPayout.ts";

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
  /** `plaid_accounts.id` when this row came from Plaid. */
  plaidAccountId?: string;
};

/** Tokens stored on `transfers.payout_method` for bank-to-bank moves. */
export type BankPayoutMethod = "bank" | "eft" | "interac" | "ach" | "wire";

export type BankTransferMethodOption = {
  id: BankPayoutMethod;
  label: string;
  description: string;
  typical: string;
};

export type BankPayoutSpec = {
  canPayout: boolean;
  railLabel: string;
  payoutMethod: BankPayoutMethod;
  transferType: "bank";
  recipientAccount: string;
  recipientBankCode: string;
  recipientBankName: string;
  recipientName: string;
  recipientCountry: string;
  recipientPhone?: string;
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

export function railLabelFor(country: string, currency: string, method?: BankPayoutMethod | string | null): string {
  const c = country.toUpperCase();
  const m = String(method || "").toLowerCase();
  if (m.includes("interac")) return "Interac e-Transfer";
  if (m === "eft") return "Canadian EFT";
  if (m === "ach") return "US ACH";
  if (m === "wire") {
    if (c === "CA") return "CAD wire";
    if (c === "US") return "US wire";
    if (c === "GB") return "Sterling wire";
    if (c === "EU") return "SWIFT wire";
    return `${currency} wire`;
  }
  if (c === "NG") return "Nigerian bank (Fincra / Nomba)";
  if (c === "GH") return "Ghanaian bank (Fincra / Nomba)";
  if (c === "KE") return "Kenyan bank (Fincra / Nomba)";
  if (c === "CA") return "Canadian EFT";
  if (c === "US") return "US ACH";
  if (c === "ZM") return "Zambian bank";
  if (c === "GB") return "UK Faster Payments";
  if (c === "EU") return "SEPA";
  return `${currency} bank payout`;
}

/** Bank-to-bank methods this destination country can actually send on. */
export function bankTransferMethodsFor(country: string, _currency?: string): BankTransferMethodOption[] {
  const c = (country || "").toUpperCase();
  if (c === "CA") {
    const opts: BankTransferMethodOption[] = [];
    if (CAD_BANK_EFT_ENABLED) {
      opts.push({
        id: "eft",
        label: "EFT",
        description: "Canadian Electronic Funds Transfer to the linked institution, transit, and account numbers.",
        typical: "1–2 business days",
      });
    }
    if (INTERAC_ETRANSFER_ENABLED) {
      opts.push({
        id: "interac",
        label: "Interac e-Transfer",
        description: "Autodeposit to a personal email or Canadian mobile — not an eFinMoney login.",
        typical: "Minutes",
      });
    }
    opts.push({
      id: "wire",
      label: "Wire",
      description: "Same-day CAD wire using the linked bank’s routing details.",
      typical: "Same day",
    });
    return opts;
  }
  if (c === "US") {
    return [
      {
        id: "ach",
        label: "ACH",
        description: "US Automated Clearing House to the linked ABA routing and account numbers.",
        typical: "1–3 business days",
      },
      {
        id: "wire",
        label: "Wire",
        description: "Domestic USD Fedwire using the same ABA routing and account.",
        typical: "Same day",
      },
    ];
  }
  if (c === "GB") {
    return [
      {
        id: "bank",
        label: "Faster Payments",
        description: "UK Faster Payments using sort code and account number.",
        typical: "Near instant",
      },
      {
        id: "wire",
        label: "Wire / CHAPS",
        description: "High-value sterling wire using the same sort code and account.",
        typical: "Same day",
      },
    ];
  }
  if (c === "EU") {
    return [
      {
        id: "bank",
        label: "SEPA",
        description: "Euro SEPA credit transfer to the IBAN.",
        typical: "1 business day",
      },
      {
        id: "wire",
        label: "SWIFT wire",
        description: "International wire using IBAN and BIC.",
        typical: "1–3 business days",
      },
    ];
  }
  if (c === "NG") {
    return [{
      id: "bank",
      label: "NUBAN transfer",
      description: "Nigerian bank credit over Fincra or Nomba.",
      typical: "Minutes",
    }];
  }
  if (c === "GH" || c === "KE") {
    return [{
      id: "bank",
      label: "Local bank transfer",
      description: "In-country bank credit over Fincra or Nomba.",
      typical: "Minutes to same day",
    }];
  }
  return [{
    id: "bank",
    label: "Bank transfer",
    description: `In-country ${c || "bank"} credit.`,
    typical: "Same day",
  }];
}

export function defaultBankTransferMethod(bank: Pick<LinkedBank, "country" | "currency">): BankPayoutMethod {
  return bankTransferMethodsFor(bank.country, bank.currency)[0]?.id || "bank";
}

function fail(
  base: Omit<BankPayoutSpec, "canPayout" | "reason">,
  reason: string,
): BankPayoutSpec {
  return { ...base, canPayout: false, reason };
}

export function payoutSpecFor(bank: LinkedBank, method?: BankPayoutMethod | string | null): BankPayoutSpec {
  const country = (bank.country || CURRENCY_TO_COUNTRY[bank.currency] || "").toUpperCase();
  const currency = (bank.currency || COUNTRY_TO_CURRENCY[country] || "").toUpperCase();
  const d = bank.details;
  const name = bank.accountName || bank.institution || "Account holder";
  const bankName = str(d, "bank_name") || bank.institution;
  const account = str(d, "account_number", "iban");
  const bankCode = str(d, "bank_code", "routing_number", "sort_code", "institution_number");
  const live = isLivePayoutCurrency(currency);
  const chosen = (String(method || "").toLowerCase() || defaultBankTransferMethod({ country, currency })) as BankPayoutMethod;
  const payoutMethod: BankPayoutMethod =
    chosen === "eft" || chosen === "interac" || chosen === "ach" || chosen === "wire" || chosen === "bank"
      ? chosen
      : defaultBankTransferMethod({ country, currency });

  const base = {
    transferType: "bank" as const,
    recipientName: name,
    recipientBankName: bankName,
    recipientCountry: country || currency.slice(0, 2),
    currency,
    payoutMethod,
    railLabel: railLabelFor(country, currency, payoutMethod),
    recipientAccount: account,
    recipientBankCode: bankCode,
  };

  if (!live) {
    return fail(base, `In-country payouts aren't live for ${currency} yet.`);
  }

  if (country === "CA") {
    if (payoutMethod === "interac") {
      const resolved = resolveCadInteracDestination({
        interac_email: str(d, "interac_email"),
        recipient_email: str(d, "interac_email", "email"),
        recipient_phone: str(d, "interac_phone", "phone"),
        recipient_account: str(d, "interac_email", "interac_phone"),
      });
      if (resolved.ok === false) {
        return fail({ ...base, recipientAccount: "" }, resolved.error || CAD_INTERAC_MISSING_CONTACT);
      }
      return {
        ...base,
        canPayout: true,
        recipientAccount: resolved.dest.consumerId,
        recipientPhone: resolved.dest.phone || undefined,
        recipientBankCode: "",
      };
    }

    const inst = str(d, "institution_number");
    const transit = str(d, "transit_number", "branch_number");
    const acct = str(d, "account_number");
    if (!inst || !transit || !acct) {
      return fail(
        { ...base, payoutMethod: payoutMethod === "wire" ? "wire" : "eft", recipientAccount: acct, recipientBankCode: inst },
        payoutMethod === "wire"
          ? "A CAD wire needs institution, transit, and account numbers."
          : "Canadian EFT needs institution, transit, and account numbers.",
      );
    }
    return {
      ...base,
      canPayout: true,
      payoutMethod: payoutMethod === "wire" ? "wire" : "eft",
      railLabel: railLabelFor(country, currency, payoutMethod === "wire" ? "wire" : "eft"),
      recipientAccount: `${inst}-${transit}-${acct}`,
      recipientBankCode: inst,
    };
  }

  if (!account) {
    return fail(base, "This bank is missing an account number.");
  }

  if ((country === "NG" || country === "GH" || country === "KE") && !bankCode) {
    return fail(base, "Pick the bank from the list so we can verify the account.");
  }

  if (country === "US") {
    const routing = str(d, "routing_number", "institution_number");
    if (!routing) {
      return fail(base, "US ACH and wires need a 9-digit ABA routing number.");
    }
    const usMethod: BankPayoutMethod = payoutMethod === "wire" ? "wire" : "ach";
    return {
      ...base,
      canPayout: true,
      payoutMethod: usMethod,
      railLabel: railLabelFor(country, currency, usMethod),
      recipientAccount: account,
      recipientBankCode: routing,
    };
  }

  return {
    ...base,
    canPayout: true,
    payoutMethod: payoutMethod === "wire" ? "wire" : payoutMethod === "bank" ? "bank" : defaultBankTransferMethod({ country, currency }),
    recipientAccount: account,
    recipientBankCode: bankCode || str(d, "swift", "bic"),
  };
}

export function canPayoutBank(bank: LinkedBank): boolean {
  return bankTransferMethodsFor(bank.country, bank.currency).some((m) => payoutSpecFor(bank, m.id).canPayout);
}

export function lastFourOf(account: string): string {
  const digits = account.replace(/\s+/g, "");
  return digits.slice(-4) || "0000";
}

/** Plaid Auth items in Canada/US can fund a pay-in without a pre-funded wallet. */
export function canPlaidDebit(bank: LinkedBank): boolean {
  if (bank.source !== "plaid" || !bank.plaidAccountId) return false;
  const c = (bank.country || "").toUpperCase();
  return c === "CA" || c === "US";
}

/**
 * Same-company, same-currency move that should debit the source bank (Plaid)
 * instead of requiring the eFinMoney wallet to already hold the cash.
 */
export function shouldFundFromSourceBank(from: LinkedBank, to: LinkedBank): boolean {
  if (from.id === to.id) return false;
  if (from.currency.toUpperCase() !== to.currency.toUpperCase()) return false;
  if (!canPlaidDebit(from)) return false;
  return canPayoutBank(to);
}
