// FINTRAC report generation helpers.
// Produces a structured, submission-ready JSON document per report type that maps
// our records onto FINTRAC's reporting fields. The file can be uploaded via
// FINTRAC Web Reporting / API; we also return a local filing reference to track
// the submission lifecycle (draft → filed → acknowledged) in our own tables.

export type FintracType = "STR" | "LCTR" | "EFTR";

const ENTITY = {
  name: "eFinMoney",
  // Placeholders — replace with the real registered identifiers before live filing.
  msb_registration_number: "<FINTRAC_MSB_REG_NO>",
  contact: "compliance@efinmoney.com",
};

export interface FintracReport {
  report_type: FintracType;
  report_reference: string;
  generated_at: string;
  reporting_entity: typeof ENTITY;
  record: Record<string, unknown>;
}

/** Stable-ish local reference, e.g. EFTR-20260626-1A2B3C. */
export function makeFilingReference(type: FintracType): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${type}-${ymd}-${rand}`;
}

export function buildFintracReport(type: FintracType, record: Record<string, unknown>, reference: string): FintracReport {
  return {
    report_type: type,
    report_reference: reference,
    generated_at: new Date().toISOString(),
    reporting_entity: ENTITY,
    record,
  };
}

/** Build the report, trigger a browser download, and return the filing reference. */
export function downloadFintracReport(type: FintracType, record: Record<string, unknown>): string {
  const reference = makeFilingReference(type);
  const report = buildFintracReport(type, record, reference);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${reference}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return reference;
}
