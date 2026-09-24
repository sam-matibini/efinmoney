/**
 * Fincra USD bank-receive (VA / ACH deposit) helpers.
 */
import { creditWalletViaFincra } from "./fincra-credit.ts";
import { fincraFetch, getFincraConfig } from "./fincra.ts";

export const FINCRA_USD_OPEN_STATUSES = ["pending", "awaiting_payment", "claimed_sent"];
export const FINCRA_USD_DONE_STATUSES = ["settled", "completed"];

export type FincraUsdIntentRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  amount: number;
  reference: string;
  public_id?: string | null;
  status: string;
  purpose?: string | null;
  transfer_id?: string | null;
  provider_reference?: string | null;
};

export type FincraUsdVaDetails = {
  configured: boolean;
  virtualAccountId: string | null;
  accountName: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
  bankName: string | null;
  status: string | null;
  source: "env" | "api" | "none";
};

/** Resolve platform USD receive account from secrets or Fincra VA list. */
export async function resolveFincraUsdVa(): Promise<FincraUsdVaDetails> {
  const envId = (Deno.env.get("FINCRA_USD_VIRTUAL_ACCOUNT_ID") || "").trim();
  const empty: FincraUsdVaDetails = {
    configured: false,
    virtualAccountId: envId || null,
    accountName: null,
    accountNumber: null,
    routingNumber: null,
    bankName: null,
    status: null,
    source: "none",
  };

  try {
    const cfg = getFincraConfig();
    const paths = [
      "/profile/virtual-accounts/?currency=usd",
      "/profile/virtual-accounts?currency=USD",
      "/profile/virtual-accounts/requests",
    ];
    for (const path of paths) {
      const r = await fincraFetch(path, { method: "GET" });
      if (!r.ok) continue;
      const data = r.json?.data as Record<string, unknown> | unknown[] | undefined;
      const results = Array.isArray(data)
        ? data
        : Array.isArray((data as Record<string, unknown> | undefined)?.results)
          ? (data as Record<string, unknown>).results as unknown[]
          : [];
      const rows = results as Array<Record<string, unknown>>;
      const preferred = envId
        ? rows.find((x) => String(x._id || x.id) === envId)
        : rows.find((x) => String(x.currency || "").toUpperCase() === "USD" && String(x.status || "").toLowerCase() === "approved")
          || rows.find((x) => String(x.currency || "").toUpperCase() === "USD");
      if (!preferred && path.includes("requests")) {
        const reqRow = rows.find((x) => String(x.currency || "").toUpperCase() === "USD");
        if (reqRow) {
          return {
            ...empty,
            status: String(reqRow.status || "pending"),
            source: "api",
            configured: false,
          };
        }
        continue;
      }
      if (!preferred) continue;
      const info = (preferred.accountInformation || {}) as Record<string, unknown>;
      const other = (info.otherInfo || {}) as Record<string, unknown>;
      const status = String(preferred.status || "").toLowerCase();
      const accountNumber = String(info.accountNumber || other.accountNumber || "").trim();
      const routing = String(
        info.routingNumber || info.bankCode || other.routingNumber || other.bankCode || "",
      ).trim();
      return {
        configured: status === "approved" && Boolean(accountNumber),
        virtualAccountId: String(preferred._id || preferred.id || envId || "") || null,
        accountName: String(info.accountName || preferred.accountName || "").trim() || null,
        accountNumber: accountNumber || null,
        routingNumber: routing || null,
        bankName: String(info.bankName || other.bankName || "").trim() || null,
        status: status || null,
        source: envId ? "env" : "api",
      };
    }
  } catch (e) {
    console.warn("resolveFincraUsdVa", e);
  }

  if (envId) {
    return { ...empty, virtualAccountId: envId, source: "env", status: "unknown" };
  }
  return empty;
}

async function releaseLinkedTransfer(transferId: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/execute-transfer`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": key,
    },
    body: JSON.stringify({ transfer_id: transferId }),
  });
}

export async function settleFincraUsdBankIntent(
  // deno-lint-ignore no-explicit-any
  admin: any,
  intent: FincraUsdIntentRow,
  providerReference: string | null,
  matchTier: string,
): Promise<FincraUsdIntentRow> {
  if (FINCRA_USD_DONE_STATUSES.includes(intent.status)) {
    return intent;
  }

  const amount = Number(intent.amount);
  const creditRef = `usd-bank-${intent.id}`;
  const refs = [creditRef];
  if (providerReference) refs.push(providerReference);
  const { data: alreadyCredited } = await admin
    .from("ledger_entries")
    .select("id")
    .eq("reference_type", "fincra_topup")
    .in("external_reference", refs)
    .limit(1);
  if (!alreadyCredited?.length) {
    await creditWalletViaFincra(
      admin,
      intent.user_id,
      "USD",
      amount,
      creditRef,
      intent.wallet_id,
      `USD bank transfer (${intent.reference}${providerReference ? ` · ${providerReference}` : ""})`,
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("fincra_usd_bank_intents")
    .update({
      status: "settled",
      provider_reference: providerReference || intent.provider_reference || null,
      credited_at: nowIso,
      confirmed_at: nowIso,
      received_at: nowIso,
      matched_at: nowIso,
      match_tier: matchTier,
    })
    .eq("id", intent.id)
    .in("status", FINCRA_USD_OPEN_STATUSES)
    .select("id, user_id, wallet_id, amount, reference, public_id, status, purpose, transfer_id, provider_reference")
    .maybeSingle();

  if (error) throw new Error(error.message);

  const settled: FincraUsdIntentRow = updated ?? {
    ...intent,
    status: "settled",
    provider_reference: providerReference,
  };

  if (intent.purpose === "transfer" && intent.transfer_id) {
    try {
      await releaseLinkedTransfer(intent.transfer_id);
    } catch (releaseErr) {
      console.warn("fincraUsd: transfer release failed", releaseErr);
    }
  }

  return settled;
}
