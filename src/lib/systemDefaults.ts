// Platform-wide defaults. Change here, not in components.

/** Currency the platform falls back to when nothing else is known. */
export const SYSTEM_DEFAULT_CURRENCY = "CAD";

/** Operational clock for admin/system surfaces (CST/CDT). */
export const SYSTEM_TIMEZONE = "America/Chicago";

/** Country used when a profile has no domicile on file. */
export const SYSTEM_DEFAULT_COUNTRY = "CA";

/**
 * Resolve the base currency for a user from their domicile country,
 * falling back to their stored preference, then the system default.
 */
export const resolveBaseCurrency = (
  countryCurrency?: string | null,
  storedCurrency?: string | null,
): string => countryCurrency || storedCurrency || SYSTEM_DEFAULT_CURRENCY;
