import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { productFeatures } from "@/lib/productFeatures";
import type { NigeriaBank, NombaExchangeQuote } from "@/lib/nombaNigeria";
import {
  getNigeriaBanks as getNombaBanks,
  getNombaExchangeRate,
  isNgnPair,
} from "@/lib/nombaNigeria";

export { isNgnPair };

async function invokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : "Request failed";
}

async function authFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${session?.access_token || anonKey}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json;
}

const CURRENCY_COUNTRY: Record<string, string> = {
  NGN: "NG",
  GHS: "GH",
  KES: "KE",
  UGX: "UG",
  CAD: "CA",
};

/** Prefer Flovide bank list; fall back to Nomba for NGN. */
export async function getCorridorBanks(
  currency: string,
): Promise<{ banks: NigeriaBank[]; source?: string; fallback?: string }> {
  const c = currency.toUpperCase();
  if (productFeatures.flovide) {
    try {
      const country = CURRENCY_COUNTRY[c] || c.slice(0, 2);
      const json = await authFetch(
        `flovide-get-banks?country=${encodeURIComponent(country)}&currency=${encodeURIComponent(c)}`,
        { method: "GET" },
      );
      const banks = Array.isArray(json?.banks)
        ? json.banks.map((b: Record<string, unknown>) => ({
          code: String(b.code || ""),
          name: String(b.name || ""),
          nipCode: null,
          logo: null,
        })).filter((b: NigeriaBank) => b.code && b.name)
        : [];
      if (banks.length > 0) {
        return { banks, source: "flovide" };
      }
    } catch {
      /* fall through */
    }
  }

  if (c === "NGN") {
    return getNombaBanks();
  }
  return { banks: [], source: "none" };
}

/** Prefer Flovide account inquiry; then Nomba; then Flutterwave for NGN. */
export async function resolveCorridorAccount(
  accountNumber: string,
  bankCode: string,
  currency = "NGN",
) {
  const c = currency.toUpperCase();
  type ResolveResult = {
    resolved: boolean;
    unverified?: boolean;
    account_name?: string;
    account_number?: string;
    error?: string;
    source?: string;
  };

  const tryInvoke = async (fn: string, body: Record<string, string>): Promise<ResolveResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      // Non-2xx still often includes a useful JSON body
      const payload = (data || null) as ResolveResult | null;
      if (payload?.resolved && payload.account_name) return payload;
      if (!error && payload) return payload;
      if (payload?.error || payload?.unverified) return payload;
      return null;
    } catch {
      return null;
    }
  };

  if (productFeatures.flovide) {
    const flovide = await tryInvoke("flovide-resolve-account", {
      accountNumber,
      bankCode,
      currency: c,
    });
    if (flovide?.resolved && flovide.account_name) return flovide;
  }

  if (c === "NGN") {
    const nomba = await tryInvoke("nomba-resolve-account", { accountNumber, bankCode });
    if (nomba?.resolved && nomba.account_name) return nomba;

    if (productFeatures.flutterwave) {
      const flw = await tryInvoke("flw-resolve-account", { accountNumber, bankCode });
      if (flw?.resolved && flw.account_name) return flw;
      if (flw?.unverified) return flw;
    }

    // Soft failure — allow send to continue with manual name check
    return {
      resolved: false,
      unverified: true,
      account_number: accountNumber,
      error:
        nomba?.error
        || "Name verification temporarily unavailable. Double-check the account number and continue.",
      source: nomba?.source || "none",
    };
  }

  return {
    resolved: false,
    account_number: accountNumber,
    error: "Account lookup unavailable for this corridor",
    source: "none",
  };
}

/**
 * Partner FX overlay for send / exchange UI.
 *
 * Customer mid-market rates come from `fx_rates` (OpenExchangeRates / er-api),
 * refreshed by `refresh-fx-rates`. Partner quotes only when they are the
 * settlement rail — Nomba for NGN pairs.
 *
 * Flovide FX is intentionally not used here: it was overriding correct
 * CAD↔Africa mid-market quotes on Send.
 */
export async function getFlovideOrNombaRate(
  from: string,
  to: string,
): Promise<NombaExchangeQuote | null> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();

  if (isNgnPair(f, t) && productFeatures.nombaNigeria) {
    try {
      return await getNombaExchangeRate(f, t);
    } catch {
      return null;
    }
  }

  return null;
}

export { invokeErrorMessage };
