import { SYSTEM_TIMEZONE } from "./systemDefaults";

type DateInput = string | number | Date | null | undefined;

const toDate = (value: DateInput): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DEFAULT_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

/** Format a timestamp in an explicit IANA timezone. */
export const formatInTz = (
  value: DateInput,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = DEFAULT_OPTS,
): string => {
  const d = toDate(value);
  if (!d) return "—";
  try {
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-CA", opts).format(d);
  }
};

/** Format a timestamp in the viewer's timezone (pass the value from useUserTimezone). */
export const formatInUserTz = (
  value: DateInput,
  timeZone?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string => formatInTz(value, timeZone || browserTimezone(), opts);

/** Format a timestamp on the system clock (CST/CDT), with a short zone label. */
export const formatInSystemTz = (
  value: DateInput,
  opts: Intl.DateTimeFormatOptions = DEFAULT_OPTS,
): string => {
  const d = toDate(value);
  if (!d) return "—";
  return `${formatInTz(d, SYSTEM_TIMEZONE, opts)} ${systemTzLabel(d)}`;
};

/** "CST" or "CDT" depending on the date. */
export const systemTzLabel = (value: DateInput = new Date()): string => {
  const d = toDate(value) ?? new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: SYSTEM_TIMEZONE,
      timeZoneName: "short",
    }).formatToParts(d);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "CST";
  } catch {
    return "CST";
  }
};

export const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SYSTEM_TIMEZONE;
  } catch {
    return SYSTEM_TIMEZONE;
  }
};
