/**
 * One-shot: POST full CAD individual VA request to Fincra.
 * Uses FINCRA_SECRET_KEY from Supabase secrets (no local key needed).
 *
 * POST { confirm: "efm-cad-va", payload?: {...} }
 * POST { confirm: "efm-cad-va", action: "list" }
 * POST { confirm: "efm-cad-va", action: "probe_cad" } — CAD wallet + collections for live-015 VA
 */
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Default KYC payload — address matches Fincra sample that passed review (Admiralty Way, Lagos). */
const DEFAULT_CAD_INDIVIDUAL_PAYLOAD = {
  currency: "CAD",
  accountType: "individual",
  meansOfId: "https://files.catbox.moe/ha9tlo.png",
  utilityBill: "https://files.catbox.moe/p5xa70.pdf",
  KYCInformation: {
    firstName: "Sam015",
    lastName: "Matibini015",
    email: "support.cad.live-015@efin.money",
    phone: "+14316680052",
    birthDate: "1976-10-14",
    nationality: "CA",
    occupation: "Business",
    employmentStatus: "self_employed",
    taxCountry: "CA",
    sourceOfIncome: "business_income",
    accountDesignation: "personal",
    monthlyTransactionVolume: "50000",
    monthlyTransactionCount: "200",
    incomeBand: {
      lower: "10000",
      upper: "100000",
    },
    address: {
      countryOfResidence: "NG",
      number: "12",
      street: "Admiralty Way",
      city: "Lagos",
      state: "Lagos",
      zip: "106104",
    },
    document: {
      type: "passport",
      number: "P290799ED",
      issuedCountryCode: "CA",
      issuedBy: "OTTAWA",
      issuedDate: "2025-04-10",
      expirationDate: "2035-04-10",
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "POST required" }, { status: 405, headers: corsHeaders });
    }
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== "efm-cad-va") {
      return Response.json({ error: "confirm must be efm-cad-va" }, { status: 403, headers: corsHeaders });
    }
    if (!Deno.env.get("FINCRA_SECRET_KEY")) {
      return Response.json({ error: "FINCRA_SECRET_KEY missing" }, { status: 503, headers: corsHeaders });
    }

    if (body?.action === "probe_cad") {
      const cfg = getFincraConfig();
      const vaId = String(
        body.virtual_account_id
          || Deno.env.get("FINCRA_CAD_VIRTUAL_ACCOUNT_ID")
          || "6a8cbf35660d7787fde7d4bd",
      ).trim();
      const bizId = cfg.businessId || "";

      const [me, wallets, disburseWallets, collections, vas] = await Promise.all([
        fincraFetch("/profile/business/me", { method: "GET" }),
        bizId
          ? fincraFetch(`/wallets?businessID=${encodeURIComponent(bizId)}`, { method: "GET" })
          : Promise.resolve({ ok: false, status: 0, json: { error: "no business id" } }),
        fincraFetch("/disbursements/wallets", { method: "GET" }),
        bizId && vaId
          ? fincraFetch(
            `/collections?business=${encodeURIComponent(bizId)}&virtualAccount=${encodeURIComponent(vaId)}`,
            { method: "GET" },
          )
          : Promise.resolve({ ok: false, status: 0, json: { error: "missing business or va id" } }),
        fincraFetch("/profile/virtual-accounts/?currency=cad", { method: "GET" }),
      ]);

      const walletRows = Array.isArray(wallets.json?.data) ? wallets.json.data : [];
      const cadWallet = walletRows.find((w: Record<string, unknown>) =>
        String(w.currency || "").toUpperCase() === "CAD"
      );
      const disburseRows = Array.isArray(disburseWallets.json?.data)
        ? disburseWallets.json.data
        : [];
      const cadDisburse = disburseRows.find((w: Record<string, unknown>) =>
        String(w.currency || "").toUpperCase() === "CAD"
      );
      const vaRows = Array.isArray((vas.json as Record<string, unknown>)?.data)
        ? ((vas.json as Record<string, unknown>).data as Record<string, unknown>[])
        : Array.isArray((vas.json as Record<string, unknown>)?.data?.results)
        ? ((vas.json as Record<string, unknown>).data as Record<string, unknown>).results as Record<
          string,
          unknown
        >[]
        : [];
      const va015 = vaRows.find((r) => String(r._id || r.id) === vaId);

      return Response.json({
        ok: true,
        mode: cfg.mode,
        business_id: bizId || (me.json as Record<string, unknown>)?.data?._id || null,
        virtual_account_id: vaId,
        interac_alias:
          ((va015?.accountInformation as Record<string, unknown> | undefined)?.otherInfo as
            | Record<string, unknown>
            | undefined)?.interacEmail
          || "support.cad.live-015@fincra.ca",
        cad_wallet: cadWallet
          ? {
            available: cadWallet.availableBalance,
            ledger: cadWallet.ledgerBalance,
            locked: cadWallet.lockedBalance,
            currency: cadWallet.currency,
          }
          : null,
        cad_disburse_wallet: cadDisburse
          ? {
            balance: cadDisburse.balance ?? cadDisburse.availableBalance,
            currency: cadDisburse.currency,
          }
          : null,
        collections: {
          ok: collections.ok,
          status: collections.status,
          count: Array.isArray(collections.json?.data) ? collections.json.data.length : 0,
          recent: Array.isArray(collections.json?.data)
            ? (collections.json.data as Record<string, unknown>[]).slice(0, 10).map((c) => ({
              amount: c.amountReceived ?? c.destinationAmount ?? c.sourceAmount ?? c.amount,
              currency: c.destinationCurrency ?? c.sourceCurrency ?? c.currency,
              status: c.status,
              reference: c.reference ?? c.sessionId,
              description: c.description,
              customerName: c.customerName ?? c.senderAccountName,
              createdAt: c.createdAt,
            }))
            : collections.json,
        },
        raw: {
          wallets_status: wallets.status,
          disburse_status: disburseWallets.status,
          collections_status: collections.status,
        },
      }, { headers: corsHeaders });
    }

    if (body?.action === "list") {
      const [vas, reqs] = await Promise.all([
        fincraFetch("/profile/virtual-accounts/?currency=cad", { method: "GET" }),
        fincraFetch("/profile/virtual-accounts/requests", { method: "GET" }),
      ]);
      return Response.json({
        accounts: { ok: vas.ok, status: vas.status, json: vas.json },
        requests: { ok: reqs.ok, status: reqs.status, json: reqs.json },
      }, { headers: corsHeaders });
    }

    const payload = {
      ...(body.payload && typeof body.payload === "object"
        ? body.payload
        : DEFAULT_CAD_INDIVIDUAL_PAYLOAD),
      merchantReference: body.merchantReference || `efm-cad-${Date.now()}`,
    };

    const created = await fincraFetch("/profile/virtual-accounts/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return Response.json({
      success: created.ok,
      http_status: created.status,
      fincra: created.json,
      payload_echo: {
        currency: payload.currency,
        accountType: payload.accountType,
        meansOfId: payload.meansOfId,
        utilityBill: payload.utilityBill,
        state: payload.KYCInformation?.address?.state,
        name: `${payload.KYCInformation?.firstName} ${payload.KYCInformation?.lastName}`,
        email: payload.KYCInformation?.email,
      },
    }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500, headers: corsHeaders },
    );
  }
});
