// Recomputes partner_performance (success rate, reversals, speed) from real
// transfer outcomes. Scheduled hourly; also callable manually by an operator.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const WINDOWS = [7, 30, 90];

interface Bucket {
  total: number;
  success: number;
  failure: number;
  reversal: number;
  seconds: number[];
}

const emptyBucket = (): Bucket => ({ total: 0, success: 0, failure: 0, reversal: 0, seconds: [] });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const rows: Record<string, unknown>[] = [];

    for (const windowDays of WINDOWS) {
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

      // Partner attribution comes from routing decisions (actual partner used).
      const { data: decisions, error: decErr } = await supabase
        .from("routing_decisions")
        .select("transfer_id, actual_partner_id, selected_partner_id, source_currency, dest_currency, created_at")
        .gte("created_at", since)
        .not("transfer_id", "is", null);
      if (decErr) throw decErr;

      const transferIds = [
        ...new Set((decisions ?? []).map((d: any) => d.transfer_id).filter(Boolean)),
      ];
      if (!transferIds.length) continue;

      const { data: transfers, error: trErr } = await supabase
        .from("transfers")
        .select("id, status, created_at, completed_at")
        .in("id", transferIds);
      if (trErr) throw trErr;

      const transferById = new Map((transfers ?? []).map((t: any) => [t.id, t]));
      const buckets = new Map<string, Bucket>();

      const bump = (partnerId: string, corridorKey: string, transfer: any) => {
        const key = `${partnerId}|${corridorKey}`;
        const b = buckets.get(key) ?? emptyBucket();
        b.total += 1;
        if (transfer.status === "completed") b.success += 1;
        else if (transfer.status === "failed") b.failure += 1;
        else if (transfer.status === "reversed") b.reversal += 1;
        if (transfer.completed_at && transfer.created_at) {
          const secs =
            (new Date(transfer.completed_at).getTime() - new Date(transfer.created_at).getTime()) / 1000;
          if (secs > 0 && secs < 30 * 86_400) b.seconds.push(secs);
        }
        buckets.set(key, b);
      };

      for (const d of decisions ?? []) {
        const partnerId = d.actual_partner_id ?? d.selected_partner_id;
        if (!partnerId) continue;
        const transfer = transferById.get(d.transfer_id);
        if (!transfer) continue;
        const corridorKey = `${d.source_currency}->${d.dest_currency}`;
        bump(partnerId, corridorKey, transfer);
        bump(partnerId, "ALL", transfer);
      }

      for (const [key, b] of buckets) {
        const [partner_id, corridor_key] = key.split("|");
        const decided = b.success + b.failure + b.reversal;
        const avg = b.seconds.length
          ? Math.round(b.seconds.reduce((s, n) => s + n, 0) / b.seconds.length)
          : null;
        rows.push({
          partner_id,
          corridor_key,
          window_days: windowDays,
          total_count: b.total,
          success_count: b.success,
          failure_count: b.failure,
          reversal_count: b.reversal,
          success_rate: decided > 0 ? Math.round((b.success / decided) * 10000) / 100 : 100,
          avg_processing_seconds: avg,
          computed_at: new Date().toISOString(),
        });
      }
    }

    if (rows.length) {
      const { error } = await supabase
        .from("partner_performance")
        .upsert(rows, { onConflict: "partner_id,corridor_key,window_days" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ success: true, upserted: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("partner-performance-refresh failed", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
