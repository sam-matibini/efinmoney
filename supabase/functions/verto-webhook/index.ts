import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, corsPreflightResponse, jsonResponse } from "../_shared/cors.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse();

  const secret = Deno.env.get("VERTO_WEBHOOK_SECRET")?.trim();
  if (secret) {
    const header = req.headers.get("x-verto-signature") || req.headers.get("x-webhook-secret") || "";
    if (header !== secret) {
      return jsonResponse({ error: "Invalid webhook secret" }, 401);
    }
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const db = admin as unknown as { from: (t: string) => any };

  try {
    const payload = asRecord(await req.json().catch(() => ({})));
    const data = asRecord(payload.data);
    const paymentId = String(
      payload.paymentId || payload.payment_id || data.paymentId || data.id || payload.id || "",
    );
    const status = String(payload.status || data.status || payload.event || "").toLowerCase();
    if (!paymentId) return jsonResponse({ ok: true, ignored: true });

    const mapped =
      status.includes("complete") || status.includes("success")
        ? "completed"
        : status.includes("archive") || status.includes("fail") || status.includes("cancel")
        ? "archived"
        : status.includes("refund")
        ? "refunded"
        : status || "requested";

    await db
      .from("verto_transfers")
      .update({ status: mapped, raw: payload, updated_at: new Date().toISOString() })
      .eq("payment_id", paymentId);

    const { data: row } = await db
      .from("verto_transfers")
      .select("transfer_id")
      .eq("payment_id", paymentId)
      .maybeSingle();
    if (row?.transfer_id && mapped === "completed") {
      await db.from("transfers").update({ status: "completed" }).eq("id", row.transfer_id);
    }

    return jsonResponse({ ok: true, paymentId, status: mapped });
  } catch (e) {
    console.error("verto-webhook", e);
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

void corsHeaders;
