/**
 * Nuvei Payment Middleware sandbox.
 * Docs: https://www.nuveiplatforms.com/payment-middleware.html
 *
 * CAD Bank EFT is Coming soon (no live keys). This function lists gateways,
 * exchanges a middleware token when secrets exist, and refuses live debit
 * until NUVEI_CAD_EFT_LIVE is enabled.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import {
  buildNuveiCadEftSale,
  getNuveiConfig,
  nuveiConfigured,
  nuveiExchangeCredentials,
  nuveiFetch,
  nuveiGatewaySettings,
  nuveiListGateways,
} from "../_shared/nuvei.ts";

const CAD_EFT_LIVE = (Deno.env.get("NUVEI_CAD_EFT_LIVE") || "").trim() === "true";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonResponse({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      amount?: number;
      order_id?: string;
      transfer_id?: string;
      wallet_id?: string;
      settings?: Record<string, unknown>;
      gateway?: string;
    };
    const action = String(body.action || "ping").toLowerCase();
    const cfg = getNuveiConfig();

    if (action === "ping" || action === "status") {
      const listed = await nuveiListGateways();
      return jsonResponse({
        provider: "nuvei",
        sandbox: true,
        docs: "https://www.nuveiplatforms.com/payment-middleware.html",
        base_url: cfg.baseUrl,
        gateway: cfg.gateway,
        configured: nuveiConfigured(cfg),
        cad_eft_live: CAD_EFT_LIVE,
        coming_soon: !CAD_EFT_LIVE,
        gateways: listed.ok ? listed.json : null,
        gateway_list_status: listed.status,
      });
    }

    if (action === "list_gateways") {
      const listed = await nuveiListGateways();
      return jsonResponse({ ok: listed.ok, status: listed.status, data: listed.json }, listed.ok ? 200 : listed.status);
    }

    if (action === "settings") {
      const settings = await nuveiGatewaySettings(body.gateway);
      return jsonResponse({ ok: settings.ok, status: settings.status, data: settings.json }, settings.ok ? 200 : settings.status);
    }

    if (action === "credentials") {
      if (!nuveiConfigured(cfg) && !body.settings) {
        return jsonResponse({
          error: "Nuvei sandbox credentials are not set. Add NUVEI_MW_SETTINGS_JSON or NUVEI_MW_CREDENTIALS.",
          coming_soon: true,
        }, 503);
      }
      const creds = await nuveiExchangeCredentials(body.settings);
      return jsonResponse({ ok: creds.ok, status: creds.status, data: creds.json }, creds.ok ? 200 : creds.status);
    }

    if (action === "process_eft" || action === "process") {
      if (!CAD_EFT_LIVE) {
        return jsonResponse({
          coming_soon: true,
          live: false,
          provider: "nuvei",
          rail: "eft",
          message: "Nuvei Canadian EFT is coming soon. Card is Nomba; Interac is Fincra Autodeposit.",
        }, 200);
      }
      if (!nuveiConfigured(cfg)) {
        return jsonResponse({ error: "Nuvei is not configured", coming_soon: true }, 503);
      }
      const amount = Number(body.amount);
      const orderId = String(body.order_id || body.transfer_id || "").trim();
      if (!Number.isFinite(amount) || amount < 1) {
        return jsonResponse({ error: "Minimum amount is CAD 1.00" }, 400);
      }
      if (!orderId) return jsonResponse({ error: "order_id required" }, 400);
      const payload = buildNuveiCadEftSale({
        amount,
        orderId,
        name: String(user.user_metadata?.full_name || user.email || "eFinMoney customer"),
        email: String(user.email || ""),
        customerId: user.id,
      });
      const started = await nuveiFetch("/api/Transaction/ProcessTransaction", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return jsonResponse({
        ok: started.ok,
        status: started.status,
        data: started.json,
      }, started.ok ? 200 : started.status);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    console.error(e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
