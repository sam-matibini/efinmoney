/** Canadian financial institution numbers (Payments Canada 3-digit codes). */
export const CA_INSTITUTIONS: Record<string, string> = {
  "001": "Bank of Montreal",
  "002": "Scotiabank",
  "003": "Royal Bank of Canada",
  "004": "TD Canada Trust",
  "006": "National Bank of Canada",
  "010": "CIBC",
  "016": "HSBC Bank Canada",
  "030": "Canadian Western Bank",
  "039": "Laurentian Bank",
  "219": "ATB Financial",
  "320": "PC Financial",
  "540": "Manulife Bank",
  "614": "Tangerine",
  "623": "Equitable Bank (EQ Bank)",
  "703": "Wealthsimple",
  "809": "Central 1 Credit Union (BC)",
  "815": "Desjardins",
  "828": "Central 1 Credit Union (ON)",
  "837": "Meridian Credit Union",
  "865": "Servus Credit Union",
  "879": "Credit Union (MB)",
  "889": "SaskCentral Credit Union",
  "899": "Alberta Credit Union",
};

export function caInstitutionName(code: string): string | null {
  const c = String(code || "").replace(/\D/g, "").padStart(3, "0").slice(-3);
  return CA_INSTITUTIONS[c] ?? null;
}
