import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchNombaGlobalTransaction, nombaApiConfigured } from "../_shared/nomba-api.ts";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nombaResponseIndicatesSuccess(rawResponse: unknown): boolean {
  if (!rawResponse || typeof rawResponse !== "object") return false;
  const json = rawResponse as Record<string, unknown>;
  const outer = (json.data ?? json) as Record<string, unknown>;
  const code = String(outer?.code ?? json.code ?? "");
  if (code === "00" || code === "200") return true;
  const status = String(outer?.status ?? outer?.prettyStatus ?? json.status ?? "").toUpperCase();
  if (status.includes("SUCCESS") || status === "COMPLETED" || status === "SETTLED") return true;
  if (String(outer?.coreStatus || "").toUpperCase().includes("SUCCESS")) return true;
  if (outer?.status === true || json.status === true) return true;
  return false;
}

function nombaResponseIndicatesFailed(rawResponse: unknown): boolean {
  if (!rawResponse || typeof rawResponse !== "object") return false;
  const json = rawResponse as Record<string, unknown>;
  const outer = (json.data ?? json) as Record<string, unknown>;
  const status = String(outer?.status ?? outer?.prettyStatus ?? "").toUpperCase();
  return status.includes("FAIL") || status === "REVERSED" || status === "CANCELLED";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { transfer_id } = await req.json();
    if (!transfer_id) {
      return jsonResponse({ error: "transfer_id required" }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: transfer, error: transferError } = await supabase
      .from("transfers")
      .select("*")
      .eq("id", transfer_id)
      .eq("sender_id", user.id)
      .single();

    if (transferError || !transfer) {
      return jsonResponse({ error: "Transfer not found" }, 404);
    }

    if (["completed", "failed", "reversed", "expired"].includes(transfer.status)) {
      return jsonResponse({
        changed: false,
        status: transfer.status,
        note: "already_terminal",
      });
    }

    const { data: payoutTxn } = await supabase
      .from("nomba_payout_transactions")
      .select("*")
      .eq("transfer_id", transfer_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payoutTxn) {
      return jsonResponse({
        changed: false,
        status: transfer.status,
        note: "not_nomba",
      });
    }

    if (payoutTxn.status === "failed") {
      await supabase
        .from("transfers")
        .update({
          status: "failed",
          failure_reason: payoutTxn.failure_reason ?? "Bank payout failed",
        })
        .eq("id", transfer_id);

      return jsonResponse({
        changed: true,
        status: "failed",
        note: "nomba_payout_failed",
      });
    }

    if (payoutTxn.status === "completed") {
      const completedAt = transfer.completed_at ?? new Date().toISOString();
      await supabase
        .from("transfers")
        .update({
          status: "completed",
          completed_at: completedAt,
          provider_reference: payoutTxn.provider_reference ?? transfer.provider_reference,
          failure_reason: null,
        })
        .eq("id", transfer_id);

      return jsonResponse({
        changed: transfer.status !== "completed",
        status: "completed",
        note: "nomba_payout_completed",
      });
    }

    // Poll official Global Payout / domestic status when still processing.
    const providerRef = String(payoutTxn.provider_reference || "").trim();
    if (providerRef && nombaApiConfigured() && !providerRef.startsWith("API-TRANSFER-")) {
      try {
        const live = await fetchNombaGlobalTransaction(providerRef);
        if (live.ok || live.json?.data) {
          await supabase.from("nomba_payout_transactions").update({
            raw_response: live.json,
          }).eq("id", payoutTxn.id);

          if (nombaResponseIndicatesFailed(live.json) || /FAIL/i.test(live.transferStatus)) {
            const reason = String(live.json?.description || live.json?.data?.prettyStatus || "Nomba payout failed");
            await supabase.from("nomba_payout_transactions").update({
              status: "failed",
              failure_reason: reason.slice(0, 500),
            }).eq("id", payoutTxn.id);
            await supabase.from("transfers").update({
              status: "failed",
              failure_reason: reason.slice(0, 500),
            }).eq("id", transfer_id);
            return jsonResponse({ changed: true, status: "failed", note: "nomba_live_failed" });
          }

          if (nombaResponseIndicatesSuccess(live.json) || /COMPLETE|SUCCESS|SETTLED/i.test(live.transferStatus)) {
            const completedAt = new Date().toISOString();
            await supabase.from("nomba_payout_transactions").update({ status: "completed" }).eq("id", payoutTxn.id);
            await supabase.from("transfers").update({
              status: "completed",
              completed_at: completedAt,
              provider_reference: providerRef,
              failure_reason: null,
            }).eq("id", transfer_id);
            return jsonResponse({ changed: true, status: "completed", note: "nomba_live_completed" });
          }
        }
      } catch (e) {
        console.error("nomba live verify failed", e);
      }
    }

    if (
      payoutTxn.status === "processing" &&
      nombaResponseIndicatesSuccess(payoutTxn.raw_response)
    ) {
      const completedAt = new Date().toISOString();
      await supabase
        .from("nomba_payout_transactions")
        .update({ status: "completed" })
        .eq("id", payoutTxn.id);

      await supabase
        .from("transfers")
        .update({
          status: "completed",
          completed_at: completedAt,
          provider_reference: payoutTxn.provider_reference ?? transfer.provider_reference,
          failure_reason: null,
        })
        .eq("id", transfer_id);

      return jsonResponse({
        changed: true,
        status: "completed",
        note: "reconciled_from_nomba_response",
      });
    }

    return jsonResponse({
      changed: false,
      status: transfer.status,
      note: "still_processing",
    });
  } catch (err) {
    console.error("nomba-verify-transfer error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500,
    );
  }
});
