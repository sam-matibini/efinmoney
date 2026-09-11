/**
 * Returns Verto wallet balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "verto" }.
 */
import { corsHeaders, corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";
import { listVertoWallets, MOCK_WALLETS, vertoConfigured } from "../_shared/verto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();
  try {
    if (!vertoConfigured()) {
      return jsonResponse({
        balances: MOCK_WALLETS.map((w) => ({
          currency_code: w.currency,
          available_balance: w.available,
        })),
        mode: "mock",
      });
    }
    const wallets = await listVertoWallets();
    return jsonResponse({
      balances: wallets.map((w) => ({
        currency_code: w.currency,
        available_balance: w.available,
      })),
      mode: "live",
    });
  } catch (e) {
    console.error("partner-balance-verto:", e);
    return jsonResponse({ balances: [] });
  }
});

void corsHeaders;
