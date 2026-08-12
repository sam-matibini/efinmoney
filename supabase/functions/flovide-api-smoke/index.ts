/**
 * Probe Flovide Live/Test credentials and discover corridors.
 * GET /?full=1  — balances, currencies, sample banks, rates, optional Interac dry-run skip
 * GET /?interac=1&email=...&amount=1  — also try Interac collection (live money request!)
 */
import {
  flovideConfigured,
  flovideCreateInteracCollection,
  flovideGetRates,
  flovideListBalances,
  flovideListBanks,
  flovideListCurrencies,
  flovideProbePath,
  getFlovideConfig,
} from "../_shared/flovide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cfg = getFlovideConfig();
  const url = new URL(req.url);
  const full = url.searchParams.get("full") === "1";
  const wantInterac = url.searchParams.get("interac") === "1";
  const wantProbe = url.searchParams.get("probe") === "1";

  const out: Record<string, unknown> = {
    configured: flovideConfigured(cfg),
    environment: cfg.environment,
    apiBase: cfg.apiBase,
    publicKeyPresent: !!cfg.publicKey,
    secretKeyPresent: !!cfg.secretKey,
    publicKeyPreview: cfg.publicKey ? `${cfg.publicKey.slice(0, 12)}…` : null,
  };

  if (!flovideConfigured(cfg)) {
    return new Response(JSON.stringify({ ...out, ok: false, error: "Missing FLOVIDE_PUBLIC_KEY / FLOVIDE_SECRET_KEY" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const balances = await flovideListBalances();
    out.balances = { ok: balances.ok, status: balances.status, json: balances.json };

    if (!balances.ok) {
      out.ok = false;
      out.hint = String(balances.json?.message || "").toLowerCase().includes("whitelist")
        ? "Flovide Live IP whitelist is blocking this caller. Add Supabase Edge egress IPs (or temporarily clear whitelist) in Flovide → Keys and endpoints → Live IP whitelist, then Save."
        : undefined;
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    out.ok = true;

    if (full || wantInterac) {
      const currencies = await flovideListCurrencies();
      out.currencies = {
        ok: currencies.ok,
        status: currencies.status,
        codes: Array.isArray(currencies.json?.data)
          ? (currencies.json.data as Array<{ code?: string }>).map((c) => c.code).filter(Boolean)
          : currencies.json,
      };

      const bankCountries = ["NG", "CA", "KE", "GB", "GH", "UG", "ZM", "US"];
      const banks: Record<string, unknown> = {};
      for (const iso of bankCountries) {
        const r = await flovideListBanks(iso);
        const list = Array.isArray(r.json?.data) ? r.json.data as unknown[] : [];
        banks[iso] = {
          ok: r.ok,
          status: r.status,
          count: list.length,
          sample: list.slice(0, 3),
          error: r.ok ? undefined : r.json?.message,
        };
      }
      out.banks = banks;

      const ratePairs = [
        ["CAD", "NGN"],
        ["CAD", "USD"],
        ["GBP", "NGN"],
        ["USD", "KES"],
        ["NGN", "KES"],
      ] as const;
      const rates: Record<string, unknown> = {};
      for (const [from, to] of ratePairs) {
        const r = await flovideGetRates(from, to, 100);
        rates[`${from}_${to}`] = { ok: r.ok, status: r.status, json: r.json };
      }
      out.rates = rates;
    }

    if (wantProbe) {
      // Discover whether Flovide exposes any collect rails beyond CAD Interac.
      const probes: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [
        { method: "GET", path: "/api/v1/transactions" },
        { method: "GET", path: "/api/v1/transactions?currency=CAD" },
        { method: "GET", path: "/api/v1/transactions?transaction_type=collection" },
        { method: "GET", path: "/api/v1/collections" },
        { method: "GET", path: "/api/v1/virtual-accounts" },
        { method: "GET", path: "/api/v1/virtualaccounts" },
        { method: "GET", path: "/api/v1/accounts" },
        { method: "POST", path: "/api/v1/collections/bank", body: { amount: 100, currency: "NGN" } },
        { method: "POST", path: "/api/v1/collections/mobile", body: { amount: 100, currency: "KES" } },
        { method: "POST", path: "/api/v1/collections/momo", body: { amount: 100, currency: "GHS" } },
        { method: "POST", path: "/api/v1/collections/virtual-account", body: { currency: "NGN", amount: 100 } },
        { method: "POST", path: "/api/v1/virtual-accounts", body: { currency: "NGN", account_name: "eFinMoney Probe" } },
        { method: "POST", path: "/api/v1/virtualaccounts", body: { currency: "NGN", account_name: "eFinMoney Probe" } },
      ];
      const probeOut: Record<string, unknown> = {};
      for (const p of probes) {
        const r = await flovideProbePath(p.path, {
          method: p.method,
          body: p.body ? JSON.stringify(p.body) : undefined,
        });
        const sample = Array.isArray(r.json?.data)
          ? (r.json.data as unknown[]).slice(0, 2)
          : r.json?.data && typeof r.json.data === "object"
          ? r.json.data
          : undefined;
        probeOut[`${p.method} ${p.path}`] = {
          ok: r.ok,
          status: r.status,
          message: r.json?.message || r.json?.error || null,
          data_keys: r.json?.data && typeof r.json.data === "object" && !Array.isArray(r.json.data)
            ? Object.keys(r.json.data as object).slice(0, 12)
            : Array.isArray(r.json?.data)
            ? [`array:${(r.json.data as unknown[]).length}`]
            : undefined,
          sample,
        };
      }
      out.collection_probe = probeOut;
      out.ok = true;
    }

    if (wantInterac) {
      const email = (url.searchParams.get("email") || "").trim();
      const amount = Number(url.searchParams.get("amount") || "1");
      if (!email.includes("@")) {
        out.interac = { ok: false, error: "Pass ?interac=1&email=payer@example.com&amount=1" };
      } else {
        const r = await flovideCreateInteracCollection(
          Number.isFinite(amount) && amount > 0 ? amount : 1,
          email,
        );
        out.interac = { ok: r.ok, status: r.status, json: r.json };
      }
    }

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    out.ok = false;
    out.error = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify(out), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
