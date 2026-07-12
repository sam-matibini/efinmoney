import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

export interface NigeriaBank {
  code: string;
  name: string;
  nipCode?: string | null;
  logo?: string | null;
}

export interface NombaExchangeQuote {
  from: string;
  to: string;
  pair: string;
  mid_rate: string;
  effective_rate: number;
  source: string;
  fallback?: boolean;
}

export interface NombaConversionPreview {
  success: boolean;
  amount: number;
  from_currency: string;
  to_currency: string;
  converted_amount: number;
  source?: string;
  error?: string;
}

async function authFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${session?.access_token || ""}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
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

export async function getNigeriaBanks(): Promise<{ banks: NigeriaBank[]; source?: string; fallback?: string }> {
  const json = await authFetch("nomba-get-banks", { method: "GET" });
  const banks = Array.isArray(json?.banks)
    ? json.banks.map((b: Record<string, unknown>) => ({
      code: String(b.code || ""),
      name: String(b.name || ""),
      nipCode: b.nipCode ?? null,
      logo: b.logo ?? null,
    })).filter((b: NigeriaBank) => b.code && b.name)
    : [];
  return { banks, source: json.source, fallback: json.fallback };
}

export async function resolveNigeriaAccount(accountNumber: string, bankCode: string) {
  const { data, error } = await supabase.functions.invoke("nomba-resolve-account", {
    body: { accountNumber, bankCode },
  });
  if (error) throw new Error(await invokeErrorMessage(error));
  return data as {
    resolved: boolean;
    unverified?: boolean;
    account_name?: string;
    account_number?: string;
    error?: string;
    source?: string;
  };
}

export async function getNombaExchangeRate(from: string, to: string): Promise<NombaExchangeQuote | null> {
  const url = `nomba-exchange-rate?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  try {
    const json = await authFetch(url, { method: "GET" });
    if (!json?.effective_rate) return null;
    return json as NombaExchangeQuote;
  } catch {
    return null;
  }
}

export async function previewNigeriaConversion(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<NombaConversionPreview> {
  const { data, error } = await supabase.functions.invoke("nomba-transfer-conversion", {
    body: { amount, from_currency: fromCurrency, to_currency: toCurrency },
  });
  if (error) {
    return {
      success: false,
      amount,
      from_currency: fromCurrency,
      to_currency: toCurrency,
      converted_amount: 0,
      error: await invokeErrorMessage(error),
    };
  }
  return data as NombaConversionPreview;
}

export function isNgnPair(from: string, to: string): boolean {
  return from.toUpperCase() === "NGN" || to.toUpperCase() === "NGN";
}
