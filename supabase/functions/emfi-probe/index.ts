/**
 * Staff-only Fiserv EmFi (Payfare BaaS) connectivity probe.
 *
 * GET  {} → auth smoke against prod host + UAT host from baas_v1.0.0.yaml
 * POST { action: "create_mock_user" } → POST /v1/users/create-application with mock_response
 * POST { action: "get_user", payfare_id } → GET /v1/users/{id}
 */
import { emfiAuthSmoke, emfiFetch, emfiUatHost, getEmfiConfig } from "../_shared/emfi.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

function clip(body: unknown, max = 2000) {
  try {
    const s = JSON.stringify(body ?? null);
    if (s.length <= max) return body;
    return { truncated: true, preview: s.slice(0, max) };
  } catch {
    return { error: "unserializable" };
  }
}

function interpretAuth(status: number, body: Record<string, unknown> | null): string {
  const err = (body?.error as Record<string, unknown> | undefined) || body;
  const code = String((err as Record<string, unknown>)?.code || "");
  const msg = String((err as Record<string, unknown>)?.message || "");
  if (status === 401 && /InvalidApiKey/i.test(code + msg)) {
    return "gateway_reached (/api) but ApiKey rejected — key not enabled on this host, or wrong key type";
  }
  if (status === 401) return "auth_rejected — check EMFI_API_KEY / EMFI_API_SECRET";
  if (status === 403) return "forbidden — key valid but missing BaaS permission (ask EmFi to enable)";
  if (status === 400 || status === 404) return "auth_ok — user not found (expected for fake id) OR wrong path";
  if (status === 200) return "auth_ok — unexpected hit on fake id";
  if (status === 0) return "network_error";
  return `http_${status}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = await requireStaffOrCron(req);
  if ("error" in gate) return gate.error;

  const cfg = getEmfiConfig();
  if ("error" in cfg) {
    return json({
      ok: false,
      error: cfg.error,
      hint: "Set EMFI_API_KEY, EMFI_API_SECRET, EMFI_BASE_URL via supabase secrets",
    }, 500);
  }

  let body: Record<string, unknown> = {};
  if (req.method !== "GET") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const action = String(body.action || "smoke").toLowerCase();

  if (action === "get_user") {
    const id = String(body.payfare_id || "").trim();
    if (!id) return json({ error: "payfare_id required" }, 400);
    const res = await emfiFetch(`/v1/users/${encodeURIComponent(id)}`, { method: "GET" });
    return json({
      ok: res.ok,
      action,
      http_status: res.status,
      url: res.url,
      body: clip(res.json ?? res.text),
    });
  }

  if (action === "create_mock_user") {
    const externalId = crypto.randomUUID();
    const payload = {
      external_id: externalId,
      first_name: "Efin",
      last_name: "Probe",
      email: `emfi.probe.${Date.now()}@efin.money`,
      phone_number: "+14165550100",
      date_of_birth: "1990-01-15",
      ship_type: "standard",
      ssn: [{ tin_type: "SIN", tin: "123456789" }],
      address: {
        address_line1: "100 King St W",
        city: "Toronto",
        region: "ON",
        country_code: "CA",
        postal_code: "M5X1A9",
      },
      shipping_address: {
        address_line1: "100 King St W",
        city: "Toronto",
        region: "ON",
        country_code: "CA",
        postal_code: "M5X1A9",
      },
      express_consent: [
        { name: "Agreement A", accepted: true, date: "2024-01-01" },
        { name: "Agreement B", accepted: true, date: "2024-01-01" },
      ],
      mock_response: true,
      metadata: { source: "emfi-probe", external_id: externalId },
    };
    const res = await emfiFetch("/v1/users/create-application", {
      method: "POST",
      body: payload,
    });
    return json({
      ok: res.ok,
      action,
      http_status: res.status,
      url: res.url,
      interpretation: interpretAuth(res.status, res.json),
      body: clip(res.json ?? res.text),
    });
  }

  // Default: dual-host auth smoke
  const prod = await emfiAuthSmoke(cfg.baseUrl);
  const uat = await emfiAuthSmoke(emfiUatHost());

  return json({
    ok: prod.status === 400 || prod.status === 404 || prod.ok || uat.status === 400 || uat.status === 404,
    product: "Embedded Finance (EmFi / Payfare BaaS)",
    auth_headers: ["X-PFClient-Key", "X-PFClient-Secret"],
    note: "Not Interac e-Transfer — BaaS cards/ACH/payouts per baas_v1.0.0.yaml",
    config: {
      base_url: cfg.baseUrl,
      uat_url: emfiUatHost(),
      key_present: true,
      key_suffix: cfg.apiKey.slice(-6),
    },
    hosts: {
      production: {
        http_status: prod.status,
        interpretation: interpretAuth(prod.status, prod.json),
        url: prod.url,
        body: clip(prod.json ?? prod.text, 900),
      },
      uat: {
        http_status: uat.status,
        interpretation: interpretAuth(uat.status, uat.json),
        url: uat.url,
        body: clip(uat.json ?? uat.text, 900),
      },
    },
  });
});
