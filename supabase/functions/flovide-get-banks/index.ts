import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { flovideConfigured, flovideListBanks } from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const CURRENCY_TO_ISO: Record<string, string> = {
  NGN: "NG",
  GHS: "GH",
  KES: "KE",
  UGX: "UG",
  CAD: "CA",
  USD: "US",
  GBP: "GB",
  EUR: "EU",
  ZAR: "ZA",
  XOF: "SN",
};

function normalizeBank(raw: Record<string, unknown>) {
  const code = String(
    raw.bank_code || raw.bankCode || raw.code || raw.id || "",
  ).trim();
  const name = String(raw.name || raw.bankName || raw.bank_name || raw.bank || "").trim();
  return {
    code,
    name,
    country: String(raw.country || raw.country_iso || raw.countryIso || "").toUpperCase() || undefined,
    currency: String(raw.currency || "").toUpperCase() || undefined,
    type: String(raw.type || raw.transfer_method || raw.channel || "").toLowerCase() || undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!flovideConfigured()) {
      return new Response(JSON.stringify({ error: "Flovide is not configured", banks: [] }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const currency = (url.searchParams.get("currency") || "").trim().toUpperCase();
    let country = (url.searchParams.get("country") || url.searchParams.get("country_iso") || "")
      .trim()
      .toUpperCase();
    if (!country && currency) country = CURRENCY_TO_ISO[currency] || "";
    if (!country) country = "NG";

    const result = await flovideListBanks(country, currency || undefined);
    const list = Array.isArray(result.json?.data) ? result.json.data as Record<string, unknown>[] : [];
    const banks = list
      .map(normalizeBank)
      .filter((b) => b.code && b.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!result.ok && banks.length === 0) {
      return new Response(JSON.stringify({
        banks: [],
        source: "flovide",
        country,
        currency: currency || null,
        error: String(result.json?.message || "Failed to load banks"),
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      banks,
      source: "flovide",
      country,
      currency: currency || null,
      count: banks.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
      banks: [],
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
