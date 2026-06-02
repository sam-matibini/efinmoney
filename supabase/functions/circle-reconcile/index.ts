// Reconciliation: poll Circle for any local CPN transfers stuck in non-terminal
// states for > 30 minutes and sync their status. Safe to run on a cron.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { circleFetch } from "../_shared/circle.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE);

  const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: stuck } = await admin.from("transfers")
    .select("id, circle_transfer_id, status, circle_status")
    .eq("payout_method", "circle_cpn")
    .not("circle_transfer_id", "is", null)
    .in("status", ["processing", "pending"])
    .lt("created_at", cutoff)
    .limit(50);

  const results: any[] = [];
  for (const t of stuck ?? []) {
    const res = await circleFetch<any>({ method: "GET", path: `/v1/cpn/transfers/${t.circle_transfer_id}` });
    if (!res.ok) {
      results.push({ id: t.id, error: res.error });
      continue;
    }
    const d: any = res.data ?? {};
    const status = (d.status ?? "").toLowerCase();
    const update: Record<string, unknown> = { circle_status: d.status, circle_payload: d };
    if (["complete", "completed", "paid", "settled"].includes(status)) {
      update.status = "completed";
      update.completed_at = new Date().toISOString();
    } else if (["failed", "rejected", "cancelled", "returned"].includes(status)) {
      update.status = "failed";
      update.failure_reason = d.failureReason ?? `Circle status: ${d.status}`;
    }
    await admin.from("transfers").update(update).eq("id", t.id);
    results.push({ id: t.id, status: d.status });
  }

  return new Response(JSON.stringify({ checked: stuck?.length ?? 0, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
