/**
 * Country-specific bank account fields.
 * Used by the top-up "Quick add bank account" form so each country asks for the
 * details its banking system actually requires.
 */

export type BankField = {
  key: string;
  label: string;
  helper?: string;
  placeholder?: string;
  maxLength?: number;
  minLength?: number;
  numeric?: boolean;
  required?: boolean;
  uppercase?: boolean;
};

export type BankSchema = {
  country: string;
  label: string;
  fields: BankField[];
};

const BANK_NAME: BankField = {
  key: "bank_name",
  label: "Bank name",
  placeholder: "e.g. First National Bank",
  maxLength: 80,
  required: true,
};

const SCHEMAS: Record<string, BankSchema> = {
  CA: {
    country: "CA",
    label: "Canada",
    fields: [
      BANK_NAME,
      { key: "institution_number", label: "Institution number", helper: "3 digits", numeric: true, minLength: 3, maxLength: 3, required: true },
      { key: "transit_number", label: "Transit number", helper: "5 digits", numeric: true, minLength: 5, maxLength: 5, required: true },
      { key: "account_number", label: "Account number", numeric: true, minLength: 5, maxLength: 12, required: true },
      {
        key: "interac_email",
        label: "Interac Autodeposit email",
        helper: "Personal or business mailbox registered for Interac Autodeposit",
        placeholder: "ap@company.com",
        maxLength: 254,
      },
      {
        key: "interac_phone",
        label: "Interac mobile",
        helper: "Canadian mobile if Autodeposit is registered to a phone",
        placeholder: "+1 416 555 0100",
        maxLength: 16,
      },
    ],
  },
  US: {
    country: "US",
    label: "United States",
    fields: [
      BANK_NAME,
      { key: "routing_number", label: "Routing number (ABA)", helper: "9 digits — ACH and domestic wires", numeric: true, minLength: 9, maxLength: 9, required: true },
      { key: "account_number", label: "Account number", numeric: true, minLength: 4, maxLength: 17, required: true },
      { key: "account_type", label: "Account type", placeholder: "Checking or Savings", maxLength: 20 },
    ],
  },
  NG: {
    country: "NG",
    label: "Nigeria",
    fields: [
      BANK_NAME,
      { key: "account_number", label: "NUBAN account number", helper: "10 digits", numeric: true, minLength: 10, maxLength: 10, required: true },
    ],
  },
  ZM: {
    country: "ZM",
    label: "Zambia",
    fields: [
      BANK_NAME,
      { key: "account_number", label: "Account number", numeric: true, minLength: 6, maxLength: 20, required: true },
      { key: "branch", label: "Branch / sort code", maxLength: 20 },
    ],
  },
  KE: {
    country: "KE",
    label: "Kenya",
    fields: [
      BANK_NAME,
      { key: "account_number", label: "Account number", numeric: true, minLength: 6, maxLength: 20, required: true },
      { key: "branch_code", label: "Branch code", numeric: true, maxLength: 6 },
    ],
  },
  GH: {
    country: "GH",
    label: "Ghana",
    fields: [
      BANK_NAME,
      { key: "account_number", label: "Account number", numeric: true, minLength: 6, maxLength: 20, required: true },
      { key: "branch", label: "Branch", maxLength: 40 },
    ],
  },
  GB: {
    country: "GB",
    label: "United Kingdom",
    fields: [
      BANK_NAME,
      { key: "sort_code", label: "Sort code", helper: "6 digits", numeric: true, minLength: 6, maxLength: 6, required: true },
      { key: "account_number", label: "Account number", helper: "8 digits", numeric: true, minLength: 8, maxLength: 8, required: true },
      { key: "swift", label: "SWIFT / BIC", helper: "Optional for sterling wires", uppercase: true, maxLength: 11 },
    ],
  },
  EU: {
    country: "EU",
    label: "Eurozone",
    fields: [
      BANK_NAME,
      { key: "iban", label: "IBAN", uppercase: true, minLength: 15, maxLength: 34, required: true },
      { key: "bic", label: "BIC / SWIFT", uppercase: true, maxLength: 11 },
    ],
  },
  DEFAULT: {
    country: "DEFAULT",
    label: "International",
    fields: [
      BANK_NAME,
      { key: "account_number", label: "Account number / IBAN", uppercase: true, minLength: 5, maxLength: 34, required: true },
      { key: "swift", label: "SWIFT / BIC", uppercase: true, maxLength: 11 },
    ],
  },
};

const CURRENCY_TO_COUNTRY: Record<string, string> = {
  CAD: "CA",
  USD: "US",
  NGN: "NG",
  ZMW: "ZM",
  KES: "KE",
  GHS: "GH",
  GBP: "GB",
  EUR: "EU",
};

/** Countries covered by the Plaid bank-linking flow. */
export const PLAID_COUNTRIES = new Set(["CA", "US"]);

export function bankSchemaForCountry(country?: string | null): BankSchema {
  const key = (country || "").toUpperCase();
  return SCHEMAS[key] ?? SCHEMAS.DEFAULT;
}

export function countryForCurrency(currency: string): string {
  return CURRENCY_TO_COUNTRY[currency.toUpperCase()] ?? "DEFAULT";
}

export function bankSchemaForCurrency(currency: string): BankSchema {
  return bankSchemaForCountry(countryForCurrency(currency));
}

export function validateBankFields(
  schema: BankSchema,
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of schema.fields) {
    const raw = (values[f.key] ?? "").trim();
    if (!raw) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    if (f.numeric && !/^\d+$/.test(raw)) errors[f.key] = `${f.label} must be digits only`;
    else if (f.minLength && raw.length < f.minLength) errors[f.key] = `${f.label} must be at least ${f.minLength} characters`;
    else if (f.maxLength && raw.length > f.maxLength) errors[f.key] = `${f.label} must be at most ${f.maxLength} characters`;
  }
  return errors;
}

/** Best-effort account identifier used for the saved-source last four. */
export function accountIdentifier(values: Record<string, string>): string {
  const v = values.account_number || values.iban || values.swift || "";
  return v.replace(/\s+/g, "").slice(-4) || "0000";
}
