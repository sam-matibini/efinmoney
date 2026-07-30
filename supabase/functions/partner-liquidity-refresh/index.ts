// Refreshes partner_liquidity balances. Partners that expose a balance
// endpoint (balance_function_slug) are polled; the rest keep their manual
// snapshot and are simply re-evaluated for staleness.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface BalanceEntry {
  currency_code: string;
  available_balance: number;
  required_reserve?: number;
  daily_utilized?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { data: partners, error } = await supabase
      .from("payment_partners")
      .select("id, code, name, balance_function_slug, settlement_currency, liquidity_stale_minutes")
      .eq("status", "active");
    if (error) throw error;

    let refreshed = 0;
    let failed = 0;
    const stale: string[] = [];

    for (const p of partners ?? []) {
      if (!p.balance_function_slug) continue;

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/${p.balance_function_slug}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ action: "balances", partner_code: p.code }),
        });

        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
        const json = await res.json();
        const balances: BalanceEntry[] = Array.isArray(json?.balances) ? json.balances : [];
        if (!balances.length) throw new Error("no balances returned");

        const rows = balances
          .filter((b) => b?.currency_code)
          .map((b) => ({
            partner_id: p.id,
            currency_code: String(b.currency_code).toUpperCase(),
            available_balance: Number(b.available_balance) || 0,
            required_reserve: Number(b.required_reserve ?? 0) || 0,
            daily_utilized: Number(b.daily_utilized ?? 0) || 0,
            as_of: new Date().toISOString(),
            source: "api",
            refresh_error: null,
          }));

        const { error: upErr } = await supabase
          .from("partner_liquidity")
          .upsert(rows, { onConflict: "partner_id,currency_code" });
        if (upErr) throw upErr;
        refreshed += rows.length;
      } catch (e) {
        failed += 1;
        const message = e instanceof Error ? e.message : String(e);
        console.error(`liquidity refresh failed for ${p.code}`, message);
        await supabase
          .from("partner_liquidity")
          .update({ refresh_error: message.slice(0, 500) })
          .eq("partner_id", p.id);
      }
    }

    // Flag anything now past its freshness window so operators can see it.
    const { data: allLiq } = await supabase
      .from("partner_liquidity")
      .select("partner_id, currency_code, as_of");
    const staleMinutesBy = new Map(
      (partners ?? []).map((p: any) => [p.id, Number(p.liquidity_stale_minutes ?? 720)]),
    );
    for (const l of allLiq ?? []) {
      const limit = staleMinutesBy.get(l.partner_id) ?? 720;
      const ageMinutes = (Date.now() - new Date(l.as_of).getTime()) / 60000;
      if (limit > 0 && ageMinutes > limit) stale.push(`${l.partner_id}:${l.currency_code}`);
    }

    return new Response(JSON.stringify({ success: true, refreshed, failed, stale: stale.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("partner-liquidity-refresh failed", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
