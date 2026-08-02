/**
 * Wise API smoke test — personal token.
 * Staff JWT or x-internal-secret (service role).
 *
 * Secrets:
 *   WISE_API_TOKEN   — personal API token (Bearer)
 *   WISE_PROFILE_ID  — optional; otherwise first business/personal profile is used
 *   WISE_ENV         — production | sandbox (default production)
 *
 * GET/POST → lists profiles + balances for the resolved profile.
 */
import { corsHeaders, json, requireStaffOrCron } from "../_shared/treasury-worker.ts";
import { getWiseConfig, wiseFetch } from "../_shared/wise.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    const cfg = getWiseConfig();
    if (!cfg.apiToken) {
      return json({
        ok: false,
        error: "WISE_API_TOKEN secret not set",
        hint: "Create a personal API token in Wise (Settings → API tokens), then: supabase secrets set WISE_API_TOKEN=... --project-ref dkdnwumllibwdlqbjkwy",
      }, 400);
    }

    const profilesRes = await wiseFetch("/v2/profiles");
    if (!profilesRes.ok) {
      return json({
        ok: false,
        step: "list_profiles",
        status: profilesRes.status,
        error: profilesRes.json,
      }, 502);
    }

    const profiles = Array.isArray(profilesRes.json)
      ? profilesRes.json as Array<Record<string, unknown>>
      : [];

    const preferred = cfg.profileId;
    let profile =
      profiles.find((p) => String(p.id) === preferred) ||
      profiles.find((p) => String(p.type).toLowerCase() === "business") ||
      profiles[0] ||
      null;

    if (!profile) {
      return json({
        ok: false,
        step: "resolve_profile",
        error: "No Wise profiles returned for this token",
        profiles,
      }, 404);
    }

    const profileId = String(profile.id);
    const balancesRes = await wiseFetch(`/v4/profiles/${encodeURIComponent(profileId)}/balances`, {
      query: { types: "STANDARD,SAVINGS" },
    });

    return json({
      ok: balancesRes.ok,
      env: cfg.sandbox ? "sandbox" : "production",
      profile_id_secret: preferred || null,
      profile_used: {
        id: profile.id,
        type: profile.type,
        fullName: (profile.details as Record<string, unknown> | undefined)?.name
          || (profile.details as Record<string, unknown> | undefined)?.firstName
          || null,
      },
      profiles: profiles.map((p) => ({ id: p.id, type: p.type })),
      balances_status: balancesRes.status,
      balances: balancesRes.json,
      note: preferred && String(profile.id) !== preferred
        ? `WISE_PROFILE_ID=${preferred} did not match a profile; used ${profile.id} instead`
        : undefined,
    }, balancesRes.ok ? 200 : 502);
  } catch (e) {
    console.error("wise-smoke", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
