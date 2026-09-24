/**
 * Read-only Fincra capability probe: wallets + dry quotes for CAD/USD.
 * NEVER posts /disbursements/payouts.
 *
 * POST { probe_key: "efm-fincra-cap" }
 */
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    if (String(body.probe_key || "") !== "efm-fincra-cap") {
      return json({ error: "Invalid probe_key" }, 403);
    }

    const cfg = getFincraConfig();
    if (!cfg.secretKey) return json({ error: "FINCRA_SECRET_KEY missing" }, 503);

    const out: Record<string, unknown> = {
      mode: cfg.mode,
      baseUrl: cfg.baseUrl,
      businessId: cfg.businessId || null,
    };

    const me = await fincraFetch("/profile/business/me", { method: "GET" });
    const meData = (me.json?.data ?? {}) as Record<string, unknown>;
    const businessId = String(cfg.businessId || meData._id || meData.id || "");
    out.profile = {
      ok: me.ok,
      status: me.status,
      name: meData.name || meData.businessName || null,
      id: businessId || null,
      error: me.ok ? null : (me.json?.message || me.json?.error || me.json),
    };

    // Wallet endpoints used in prod code paths
    const walletPaths = [
      "/disbursements/wallets",
      businessId ? `/wallets?businessID=${encodeURIComponent(businessId)}` : null,
      businessId ? `/wallets?businessId=${encodeURIComponent(businessId)}` : null,
    ].filter(Boolean) as string[];

    const walletsDetailed: unknown[] = [];
    let walletRows: Array<Record<string, unknown>> = [];
    for (const path of walletPaths) {
      const r = await fincraFetch(path, { method: "GET" });
      const data = r.json?.data;
      const rows = Array.isArray(data)
        ? data as Array<Record<string, unknown>>
        : Array.isArray(r.json)
          ? r.json as Array<Record<string, unknown>>
          : [];
      walletsDetailed.push({
        path,
        ok: r.ok,
        status: r.status,
        count: rows.length,
        error: r.ok ? null : (r.json?.message || r.json?.error || null),
      });
      if (rows.length && walletRows.length === 0) walletRows = rows;
    }

    const focus = ["CAD", "USD", "NGN", "GBP", "EUR"];
    out.wallets = {
      attempts: walletsDetailed,
      balances: walletRows
        .map((w) => ({
          currency: String(w.currency || "").toUpperCase(),
          available: Number(w.availableBalance ?? w.balance ?? 0),
          ledger: Number(w.ledgerBalance ?? w.availableBalance ?? w.balance ?? 0),
        }))
        .filter((w) => w.currency)
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      focus: Object.fromEntries(
        focus.map((c) => {
          const hit = walletRows.find((w) => String(w.currency || "").toUpperCase() === c);
          return [c, hit
            ? {
              available: Number(hit.availableBalance ?? hit.balance ?? 0),
              ledger: Number(hit.ledgerBalance ?? hit.availableBalance ?? hit.balance ?? 0),
            }
            : null];
        }),
      ),
    };

    async function quote(label: string, payload: Record<string, unknown>) {
      if (!businessId) {
        return { label, ok: false, error: "no business id" };
      }
      const r = await fincraFetch("/quotes/generate", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          business: businessId,
          action: "receive",
          transactionType: "disbursement",
          feeBearer: "business",
          beneficiaryType: "individual",
        }),
      });
      return {
        label,
        ok: r.ok,
        status: r.status,
        message: r.json?.message || r.json?.error || null,
        data: r.ok ? r.json?.data : null,
        rawError: r.ok ? null : r.json,
      };
    }

    // Dry quotes only — never initiate payout
    out.quotes = [
      await quote("CAD Interac funded by CAD", {
        sourceCurrency: "CAD",
        destinationCurrency: "CAD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "interac",
      }),
      await quote("CAD EFT funded by CAD", {
        sourceCurrency: "CAD",
        destinationCurrency: "CAD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "eft",
      }),
      await quote("CAD Interac funded by NGN", {
        sourceCurrency: "NGN",
        destinationCurrency: "CAD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "interac",
      }),
      await quote("CAD Interac funded by USD (known bad path)", {
        sourceCurrency: "USD",
        destinationCurrency: "CAD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "interac",
      }),
      await quote("USD ACH funded by USD", {
        sourceCurrency: "USD",
        destinationCurrency: "USD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "ach",
      }),
      await quote("USD Fedwire funded by USD", {
        sourceCurrency: "USD",
        destinationCurrency: "USD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "fed_wire",
      }),
      await quote("USD SWIFT funded by USD", {
        sourceCurrency: "USD",
        destinationCurrency: "USD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "swift",
      }),
      await quote("USD ACH funded by NGN", {
        sourceCurrency: "NGN",
        destinationCurrency: "USD",
        amount: "10",
        paymentDestination: "bank_account",
        paymentScheme: "ach",
      }),
    ];

    out.summary = {
      cad_wallet: (out.wallets as { focus: Record<string, unknown> }).focus.CAD,
      usd_wallet: (out.wallets as { focus: Record<string, unknown> }).focus.USD,
      ngn_wallet: (out.wallets as { focus: Record<string, unknown> }).focus.NGN,
      cad_interac_quote_ok: (out.quotes as Array<{ label: string; ok: boolean }>).some((q) =>
        q.label.startsWith("CAD Interac funded by CAD") && q.ok
      ),
      usd_payout_quote_ok: (out.quotes as Array<{ label: string; ok: boolean }>).some((q) =>
        q.label.includes("USD") && q.label.includes("funded by USD") && q.ok
      ),
      note: "Quotes only — no /disbursements/payouts calls were made.",
    };

    return json(out);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
