/**
 * List / request Fincra USD virtual account.
 * POST { confirm: "efm-usd-va", action: "list" | "request" }
 */
import { fincraFetch, getFincraConfig } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_USD_REQUEST = {
  currency: "USD",
  accountType: "individual",
  meansOfId: "https://files.catbox.moe/ha9tlo.png",
  utilityBill: "https://files.catbox.moe/p5xa70.pdf",
  KYCInformation: {
    firstName: "Samson",
    lastName: "Matibini",
    email: "sam@efin.money",
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
    incomeBand: { lower: "10000", upper: "100000" },
    address: {
      countryOfResidence: "CA",
      number: "178",
      street: "Brookfield Crescent",
      city: "Winnipeg",
      state: "Manitoba",
      zip: "R3Y 0L7",
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
    if (body?.confirm !== "efm-usd-va") {
      return Response.json({ error: "confirm must be efm-usd-va" }, { status: 403, headers: corsHeaders });
    }
    if (!Deno.env.get("FINCRA_SECRET_KEY")) {
      return Response.json({ error: "FINCRA_SECRET_KEY missing" }, { status: 503, headers: corsHeaders });
    }

    const action = String(body.action || "list").toLowerCase();
    const cfg = getFincraConfig();

    if (action === "list") {
      const accounts = await fincraFetch("/profile/virtual-accounts/?currency=usd", { method: "GET" });
      const requests = await fincraFetch("/profile/virtual-accounts/requests", { method: "GET" });
      return Response.json({
        mode: cfg.mode,
        accounts: { ok: accounts.ok, status: accounts.status, json: accounts.json },
        requests: { ok: requests.ok, status: requests.status, json: requests.json },
      }, { headers: corsHeaders });
    }

    if (action === "request") {
      const payload = body.payload && typeof body.payload === "object"
        ? { ...DEFAULT_USD_REQUEST, ...body.payload, currency: "USD" }
        : DEFAULT_USD_REQUEST;
      const r = await fincraFetch("/profile/virtual-accounts/requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return Response.json({
        mode: cfg.mode,
        ok: r.ok,
        status: r.status,
        json: r.json,
      }, { status: r.ok ? 200 : 400, headers: corsHeaders });
    }

    return Response.json({ error: "action must be list or request" }, { status: 400, headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
