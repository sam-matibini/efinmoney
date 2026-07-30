import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveRoute, logDecision } from "../_shared/routeResolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const {
      direction = "payout",
      source_currency,
      dest_currency,
      source_country = null,
      dest_country = null,
      payment_method = null,
      customer_type = "consumer",
      amount,
      log = true,
    } = body ?? {};

    if (!source_currency || !dest_currency || !Number(amount)) {
      return new Response(
        JSON.stringify({ error: "source_currency, dest_currency and amount are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let requestedBy: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await anon.auth.getUser();
      requestedBy = data?.user?.id ?? null;
    }

    const routeReq = {
      direction,
      source_currency,
      dest_currency,
      source_country,
      dest_country,
      payment_method,
      customer_type,
      amount: Number(amount),
    };

    const resolution = await resolveRoute(supabase, routeReq);

    let decisionId: string | null = null;
    if (log) {
      decisionId = await logDecision(supabase, {
        mode: "simulation",
        req: routeReq,
        resolution,
        requested_by: requestedBy,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        decision_id: decisionId,
        mode: resolution.mode,
        kill_switch: resolution.killSwitch,
        live_corridor: resolution.liveCorridor,
        rule: resolution.rule ? { id: resolution.rule.id, name: resolution.rule.name } : null,
        recommended: resolution.candidates[0] ?? null,
        candidates: resolution.candidates,
        excluded: resolution.excluded,
        overrides: resolution.overrides,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("routing-quote error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
