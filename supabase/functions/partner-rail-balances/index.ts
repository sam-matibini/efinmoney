import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";
import { listVertoWallets, MOCK_WALLETS, vertoConfigured } from "../_shared/verto.ts";
import { getNombaApiConfig, nombaApiConfigured, nombaApiFetch } from "../_shared/nomba-api.ts";

export type PartnerRailBalance = {
  partner: "fincra" | "verto" | "nomba";
  label: string;
  currency_code: string;
  available: number;
  source: "api" | "mock" | "unconfigured" | "error";
  /** True when this rail can pay a linked NUBAN / bank account. */
  can_payout: boolean;
  error?: string;
};

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function fincraRails(): Promise<PartnerRailBalance[]> {
  const cfg = getFincraConfig();
  if (!cfg.secretKey) {
    return [{
      partner: "fincra",
      label: "Fincra",
      currency_code: "NGN",
      available: 0,
      source: "unconfigured",
      can_payout: false,
    }];
  }
  try {
    const res = await fincraFetch("/disbursements/wallets", { method: "GET" });
    if (!res.ok) {
      return [{
        partner: "fincra",
        label: "Fincra",
        currency_code: "NGN",
        available: 0,
        source: "error",
        can_payout: false,
        error: String(res.json?.error || res.json?.message || `HTTP ${res.status}`),
      }];
    }
    const items: unknown[] = Array.isArray(res.json?.data)
      ? res.json.data as unknown[]
      : Array.isArray(res.json)
        ? res.json as unknown[]
        : [];
    const rows = items
      .map((raw) => {
        const w = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
        const ccy = String(w.currency || w.currencyCode || "").toUpperCase();
        if (!ccy) return null;
        return {
          partner: "fincra" as const,
          label: "Fincra",
          currency_code: ccy,
          available: asNumber(w.availableBalance ?? w.available_balance ?? w.balance),
          source: "api" as const,
          can_payout: true,
        };
      })
      .filter((r): r is PartnerRailBalance => Boolean(r));
    return rows.length
      ? rows
      : [{ partner: "fincra", label: "Fincra", currency_code: "NGN", available: 0, source: "api", can_payout: true }];
  } catch (e) {
    return [{
      partner: "fincra",
      label: "Fincra",
      currency_code: "NGN",
      available: 0,
      source: "error",
      can_payout: false,
      error: e instanceof Error ? e.message : "Fincra balance failed",
    }];
  }
}

async function vertoRails(): Promise<PartnerRailBalance[]> {
  try {
    if (!vertoConfigured()) {
      return MOCK_WALLETS.map((w) => ({
        partner: "verto" as const,
        label: "Verto",
        currency_code: w.currency,
        available: w.available,
        source: "mock" as const,
        can_payout: false,
      }));
    }
    const wallets = await listVertoWallets();
    return wallets.map((w) => ({
      partner: "verto" as const,
      label: w.label ? `Verto · ${w.label}` : "Verto",
      currency_code: w.currency,
      available: w.available,
      source: "api" as const,
      /** Verto WALLET_PAYOUT needs a mapped beneficiary — NUBAN payouts use Fincra/Nomba. */
      can_payout: false,
    }));
  } catch (e) {
    return [{
      partner: "verto",
      label: "Verto",
      currency_code: "NGN",
      available: 0,
      source: "error",
      can_payout: false,
      error: e instanceof Error ? e.message : "Verto balance failed",
    }];
  }
}

async function nombaRails(): Promise<PartnerRailBalance[]> {
  const cfg = getNombaApiConfig();
  if (!nombaApiConfigured(cfg)) {
    return [{
      partner: "nomba",
      label: "Nomba",
      currency_code: "NGN",
      available: 0,
      source: "unconfigured",
      can_payout: false,
    }];
  }
  try {
    const res = await nombaApiFetch("/v1/accounts/balance", { method: "GET" });
    if (!res.ok) {
      return [{
        partner: "nomba",
        label: "Nomba",
        currency_code: "NGN",
        available: 0,
        source: "error",
        can_payout: false,
        error: String(res.json?.message || res.json?.error || `HTTP ${res.status}`),
      }];
    }
    const data = (res.json?.data ?? res.json ?? {}) as Record<string, unknown>;
    const currency = String(data.currency || "NGN").toUpperCase();
    return [{
      partner: "nomba",
      label: "Nomba",
      currency_code: currency,
      available: asNumber(data.availableBalance ?? data.available_balance ?? data.balance),
      source: "api",
      can_payout: true,
    }];
  } catch (e) {
    return [{
      partner: "nomba",
      label: "Nomba",
      currency_code: "NGN",
      available: 0,
      source: "error",
      can_payout: false,
      error: e instanceof Error ? e.message : "Nomba balance failed",
    }];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const [fincra, verto, nomba] = await Promise.all([fincraRails(), vertoRails(), nombaRails()]);
    const rails = [...fincra, ...verto, ...nomba];

    return jsonResponse({
      success: true,
      rails,
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("partner-rail-balances", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
