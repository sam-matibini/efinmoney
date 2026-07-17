import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getSwychrPayoutStatus, mapSwychrPayoutStatus } from "../_shared/swychr-payout.ts";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { transfer_id } = await req.json();
    if (!transfer_id) return jsonResponse({ error: "transfer_id required" }, 400);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: transfer } = await supabase.from("transfers").select("*")
      .eq("id", transfer_id).eq("sender_id", user.id).single();
    if (!transfer) return jsonResponse({ error: "Transfer not found" }, 404);

    if (["completed", "failed", "reversed", "expired"].includes(transfer.status)) {
      return jsonResponse({ changed: false, status: transfer.status, note: "already_terminal" });
    }

    const { data: payoutTxn } = await supabase.from("swychr_payout_transactions")
      .select("*").eq("transfer_id", transfer_id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (!payoutTxn) {
      return jsonResponse({ changed: false, status: transfer.status, note: "not_swychr" });
    }

    if (!isSwychrEnabled() || !isSwychrConfigured("payout")) {
      return jsonResponse({ changed: false, status: transfer.status, note: "swychr_disabled" });
    }

    const remote = await getSwychrPayoutStatus(String(payoutTxn.transaction_id));
    const mapped = mapSwychrPayoutStatus(remote.status);

    await supabase.from("swychr_payout_transactions").update({
      status: mapped,
      raw_response: remote.raw,
    }).eq("id", payoutTxn.id);

    if (mapped === "completed" && transfer.status !== "completed") {
      await supabase.from("transfers").update({
        status: "completed",
        completed_at: new Date().toISOString(),
      }).eq("id", transfer_id);
      return jsonResponse({ changed: true, status: "completed" });
    }

    if (mapped === "failed" && transfer.status !== "failed") {
      await supabase.from("transfers").update({
        status: "failed",
        failure_reason: "Bank payout failed",
      }).eq("id", transfer_id);
      return jsonResponse({ changed: true, status: "failed" });
    }

    return jsonResponse({ changed: false, status: transfer.status, remote_status: mapped });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Verify failed" }, 500);
  }
});
