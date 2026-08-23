/**
 * One-shot: POST full CAD individual VA request to Fincra.
 * POST { confirm: "efm-cad-va", ...payload fields or use defaults }
 */
import { fincraFetch } from "../_shared/fincra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

    const payload = body.payload ?? {
      currency: "CAD",
      accountType: "individual",
      meansOfId: body.meansOfId,
      utilityBill: body.utilityBill,
      KYCInformation: body.KYCInformation,
    };

    const created = await fincraFetch("/profile/virtual-accounts/requests", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return Response.json({
      success: created.ok,
      http_status: created.status,
      flutterwave: undefined,
      fincra: created.json,
      payload_echo: {
        currency: payload.currency,
        accountType: payload.accountType,
        meansOfId: payload.meansOfId,
        utilityBill: payload.utilityBill,
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
