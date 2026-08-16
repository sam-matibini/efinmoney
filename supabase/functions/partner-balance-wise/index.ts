/**
 * Returns Wise account balances in the standard partner-balance format.
 * Called by partner-liquidity-refresh with { action: "balances", partner_code: "wise" }.
 *
 * Secrets: WISE_API_TOKEN, WISE_PROFILE_ID (optional), WISE_ENV
 */
import { corsHeaders } from "../_shared/cors.ts";
import { getWiseConfig, wiseFetch } from "../_shared/wise.ts";

interface BalanceEntry {
  currency_code: string;
  available_balance: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const cfg = getWiseConfig();
    if (!cfg.apiToken) {
      console.error("partner-balance-wise: WISE_API_TOKEN not set");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    // Resolve the business profile id
    const profilesRes = await wiseFetch("/v2/profiles");
    if (!profilesRes.ok) {
      console.error("partner-balance-wise: profiles fetch failed", profilesRes.status, profilesRes.json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }
    const profiles = Array.isArray(profilesRes.json)
      ? (profilesRes.json as Array<Record<string, unknown>>)
      : [];

    const profile =
      (cfg.profileId ? profiles.find((p) => String(p.id) === cfg.profileId) : null) ||
      profiles.find((p) => String(p.type).toLowerCase() === "business") ||
      profiles[0] ||
      null;

    if (!profile) {
      console.error("partner-balance-wise: no profiles returned");
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const profileId = String(profile.id);
    const balRes = await wiseFetch(`/v4/profiles/${encodeURIComponent(profileId)}/balances`, {
      query: { types: "STANDARD" },
    });

    if (!balRes.ok) {
      console.error("partner-balance-wise: balances fetch failed", balRes.status, balRes.json);
      return Response.json({ balances: [] }, { headers: corsHeaders });
    }

    const raw = Array.isArray(balRes.json) ? (balRes.json as Array<Record<string, unknown>>) : [];
    const balances: BalanceEntry[] = raw
      .filter((b) => b?.currency && (b.amount as Record<string, unknown>)?.value != null)
      .map((b) => ({
        currency_code: String(b.currency).toUpperCase(),
        available_balance: Number((b.amount as Record<string, unknown>).value) || 0,
      }));

    return Response.json({ balances }, { headers: corsHeaders });
  } catch (e) {
    console.error("partner-balance-wise:", e);
    return Response.json({ balances: [] }, { headers: corsHeaders });
  }
});
