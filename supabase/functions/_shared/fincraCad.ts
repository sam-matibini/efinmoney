/**
 * Fincra CAD Interac e-Transfer collections.
 * Alias format: merchantname@fincra.ca (Autodeposit).
 * Docs: https://docs.fincra.com/docs/cad-collections-interac-e-transfer
 */
import { fincraFetch } from "./fincra.ts";

export type FincraCadConfig = {
  alias: string;
  virtualAccountId: string | null;
  provider: "fincra";
  source: "env" | "api" | "none";
};

function pickInteracEmail(row: Record<string, unknown>): string {
  const info = (row.accountInformation ?? row.account_information) as Record<string, unknown> | null;
  const other = (info?.otherInfo ?? info?.other_info) as Record<string, unknown> | null;
  const candidates = [
    other?.interacEmail,
    other?.interac_email,
    info?.interacEmail,
    info?.email,
    row.interacEmail,
  ];
  for (const c of candidates) {
    const s = String(c ?? "").trim().toLowerCase();
    if (s.includes("@")) return s;
  }
  return "";
}

function isApprovedCad(row: Record<string, unknown>): boolean {
  const currency = String(row.currency ?? "").toUpperCase();
  if (currency && currency !== "CAD") return false;
  const status = String(row.status ?? "").toLowerCase();
  if (status && !["approved", "active", "issued"].includes(status)) return false;
  if (row.isActive === false || row.is_active === false) return false;
  return true;
}

/** Resolve platform CAD Interac alias: secret first, then Fincra virtual-accounts API. */
export async function resolveFincraCadAlias(): Promise<FincraCadConfig> {
  const fromEnv = Deno.env.get("FINCRA_CAD_INTERAC_ALIAS")?.trim().toLowerCase() || "";
  if (fromEnv.includes("@")) {
    return {
      alias: fromEnv,
      virtualAccountId: Deno.env.get("FINCRA_CAD_VIRTUAL_ACCOUNT_ID")?.trim() || null,
      provider: "fincra",
      source: "env",
    };
  }

  try {
    const res = await fincraFetch("/profile/virtual-accounts/?currency=cad", { method: "GET" });
    if (!res.ok) {
      console.warn("fincraCad: list CAD VAs failed", res.status, JSON.stringify(res.json).slice(0, 300));
      return { alias: "", virtualAccountId: null, provider: "fincra", source: "none" };
    }

    const data = res.json?.data as Record<string, unknown> | unknown[] | undefined;
    const results: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown> | undefined)?.results)
      ? ((data as Record<string, unknown>).results as unknown[])
      : Array.isArray(res.json?.results)
      ? (res.json.results as unknown[])
      : [];

    for (const raw of results) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      if (!isApprovedCad(row)) continue;
      const email = pickInteracEmail(row);
      if (!email) continue;
      const id = String(row._id ?? row.id ?? "").trim() || null;
      return { alias: email, virtualAccountId: id, provider: "fincra", source: "api" };
    }

    console.warn("fincraCad: no approved CAD Interac alias on merchant account", {
      count: results.length,
    });
  } catch (err) {
    console.warn("fincraCad: alias resolve error", err instanceof Error ? err.message : err);
  }

  return { alias: "", virtualAccountId: null, provider: "fincra", source: "none" };
}

export function buildFincraInteracInstructions(
  amount: number,
  alias: string,
  reference: string,
  contact: string,
  purpose: string,
): string[] {
  return [
    `Open your Canadian banking app and start an Interac e-Transfer.`,
    `Send exactly CAD ${amount.toFixed(2)} to ${alias}.`,
    `Put the reference ${reference} in the message field.`,
    `Send from ${contact} so we can match your deposit.`,
    `Autodeposit is enabled — no security question needed.`,
    purpose === "transfer"
      ? `Your transfer is released once we match the deposit to this reference.`
      : purpose === "merchant_collection"
      ? `The payment is confirmed once we match the deposit to this reference.`
      : `Your CAD wallet credits once we match the deposit to this reference.`,
  ];
}
