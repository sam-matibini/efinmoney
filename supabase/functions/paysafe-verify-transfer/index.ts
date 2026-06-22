// Poll Paysafe for standalone credit / EFT / Interac status and sync our transfers row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { mapPaysafeCreditStatus, paysafeGet } from "../_shared/paysafe-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function isCanadaPaysafeTransfer(transfer: Record<string, unknown>) {
  const country = String(transfer.recipient_country ?? "").toUpperCase();
  const method = String(transfer.payout_method ?? "").toLowerCase();
  return country === "CA" || transfer.transfer_type === "domestic_canada" || method === "interac" || method === "eft";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { transfer_id } = await req.json().catch(() => ({}));
    if (!transfer_id) return json({ error: "transfer_id required" }, 400);

    const { data: transfer, error: tErr } = await supabase
      .from("transfers").select("*").eq("id", transfer_id).eq("sender_id", user.id).single();
    if (tErr || !transfer) return json({ error: "Transfer not found" }, 404);

    if (!isCanadaPaysafeTransfer(transfer)) {
      return json({ error: "Not a Canadian Paysafe transfer" }, 400);
    }

    if (["completed", "failed", "reversed", "expired", "cancelled"].includes(transfer.status)) {
      return json({ success: true, status: transfer.status, changed: false });
    }

    const paysafeId = transfer.paysafe_payment_id || transfer.provider_reference;
    if (!paysafeId || String(paysafeId).startsWith("PLINK-")) {
      return json({ success: true, status: transfer.status, changed: false, note: "no paysafe reference yet" });
    }

    const lookup = await paysafeGet(`/paymenthub/v1/standalonecredits/${encodeURIComponent(String(paysafeId))}`);
    if (!lookup.ok) {
      return json({
        success: true,
        status: transfer.status,
        changed: false,
        note: "paysafe lookup unavailable",
        provider_status: lookup.status,
      });
    }

    const providerStatus = String(lookup.json?.status ?? "");
    const newStatus = mapPaysafeCreditStatus(providerStatus);
    if (!newStatus || newStatus === transfer.status) {
      return json({
        success: true,
        status: transfer.status,
        changed: false,
        provider_status: providerStatus,
      });
    }

    const update: Record<string, unknown> = { status: newStatus };
    if (newStatus === "completed") {
      update.completed_at = new Date().toISOString();
    } else if (newStatus === "failed") {
      update.failure_reason = `Paysafe: ${providerStatus || "failed"}`.slice(0, 500);
    }
    if (lookup.json?.id) update.paysafe_payment_id = String(lookup.json.id);

    await supabase.from("transfers").update(update).eq("id", transfer_id);

    return json({
      success: true,
      status: newStatus,
      changed: true,
      provider_status: providerStatus,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("paysafe-verify-transfer error", msg);
    return json({ error: msg }, 500);
  }
});
