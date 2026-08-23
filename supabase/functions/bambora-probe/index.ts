/**
 * Staff probe: verify Bambora / Worldline NAM credentials.
 * Uses Payment Profile API passcode (BAMBORA_API_PASSCODE).
 */
import {
  bamboraFetch,
  bamboraProbeProfilesAuth,
  getBamboraConfig,
} from "../_shared/bambora.ts";
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    const cfg = getBamboraConfig();
    const profiles = await bamboraProbeProfilesAuth();

    let payments: Record<string, unknown> | null = null;
    if (cfg.paymentsPasscode) {
      const res = await bamboraFetch("/v1/payments/efin-auth-probe", {
        method: "GET",
        kind: "payments",
      });
      const msg = String(res.json?.message || `HTTP ${res.status}`);
      const authOk = res.status === 404 || (res.status !== 401 && res.status !== 403);
      payments = {
        configured: true,
        auth_ok: authOk || res.ok,
        http_status: res.status,
        message: msg,
      };
    } else {
      payments = {
        configured: false,
        auth_ok: false,
        http_status: 0,
        message:
          "Optional: set BAMBORA_PAYMENTS_PASSCODE from Configuration → Payment Gateway / Order Settings (separate from Profile passcode).",
      };
    }

    const ok = profiles.auth_ok;
    return json({
      ok,
      provider: "bambora",
      brand: "Worldline / Bambora NAM",
      docs: "https://docs.na.worldline-solutions.com/",
      merchant_id: cfg.merchantId,
      currency: cfg.currency,
      profiles_api: profiles,
      payments_api: payments,
      next_steps: ok
        ? [
          "Profiles API auth works — can tokenize / store cards.",
          "Add BAMBORA_PAYMENTS_PASSCODE to charge cards (if not set).",
          "Then wire CAD wallet top-up via Bambora card checkout.",
        ]
        : [
          "Fix Profile API passcode in Bambora admin (Payment Profile Configuration).",
          "Re-set BAMBORA_API_PASSCODE secret after Generate New Code.",
        ],
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Bambora probe failed" }, 500);
  }
});
