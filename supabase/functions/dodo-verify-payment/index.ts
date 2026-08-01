import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { creditWalletViaDodo } from "../_shared/dodo-credit.ts";
import { dodoFetch, fromMinorUnits, isDodoConfigured } from "../_shared/dodo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jr(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!isDodoConfigured()) return jr(500, { error: "Dodo not configured" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jr(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return jr(401, { error: "Unauthorized" });

    const body = await req.json().catch(() => ({}));
    const reference = String(body?.reference || body?.ref || "").trim();
    const paymentId = String(body?.payment_id || "").trim();
    const sessionId = String(body?.session_id || "").trim();

    if (!reference && !paymentId && !sessionId) {
      return jr(400, { error: "reference, payment_id, or session_id required" });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Prefer looking up payment by id; else list/filter via checkout session
    let payJson: Record<string, unknown> | null = null;
    if (paymentId) {
      const r = await dodoFetch(`/payments/${encodeURIComponent(paymentId)}`, { method: "GET" });
      if (r.ok) payJson = r.json;
    }
    if (!payJson && sessionId) {
      const r = await dodoFetch(`/checkouts/${encodeURIComponent(sessionId)}`, { method: "GET" });
      if (r.ok) {
        const linked = String(r.json?.payment_id || "");
        if (linked) {
          const p = await dodoFetch(`/payments/${encodeURIComponent(linked)}`, { method: "GET" });
          if (p.ok) payJson = p.json;
        }
      }
    }
    // Fallback: recent payments matching our reference metadata
    if (!payJson && reference.startsWith("efm_dodo_")) {
      const list = await dodoFetch("/payments?page_size=50", { method: "GET" });
      const items = Array.isArray(list.json?.items)
        ? (list.json.items as Array<Record<string, unknown>>)
        : [];
      const match = items.find((p) => {
        const m = (p.metadata || {}) as Record<string, unknown>;
        return String(m.reference || "") === reference;
      });
      if (match) payJson = match;
    }

    // Fallback: pending txn row metadata
    let meta: Record<string, unknown> = {};
    let currency = "USD";
    let amount = 0;
    let walletId = "";

    if (reference) {
      const { data: row } = await admin.from("dodo_payin_transactions")
        .select("*").eq("id", reference).maybeSingle();
      if (row) {
        if (row.user_id !== user.id) return jr(403, { error: "Not your payment" });
        currency = String(row.currency || "USD").toUpperCase();
        amount = Number(row.amount);
        walletId = String(row.wallet_id || "");
        if (row.status === "succeeded") {
          return jr(200, { success: true, already: true, status: "succeeded", amount, currency });
        }
      }
    }

    if (payJson) {
      meta = (payJson.metadata || {}) as Record<string, unknown>;
      if (meta.user_id && String(meta.user_id) !== user.id) {
        return jr(403, { error: "Payment does not belong to this user" });
      }
      currency = String(meta.currency || payJson.currency || currency).toUpperCase();
      amount = Number(meta.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        amount = fromMinorUnits(Number(payJson.total_amount ?? payJson.amount ?? 0), currency);
      }
      walletId = String(meta.wallet_id || walletId);
      const status = String(payJson.status || "").toLowerCase();
      if (status !== "succeeded" && status !== "paid") {
        return jr(200, { success: false, status, message: "Payment not completed yet" });
      }
      const idem = String(meta.reference || reference || payJson.payment_id || paymentId);
      const result = await creditWalletViaDodo(
        admin,
        user.id,
        currency,
        amount,
        idem,
        walletId || undefined,
        `Top-up via Dodo verify (${payJson.payment_id || paymentId})`,
      );
      return jr(200, {
        success: true,
        already: result.already,
        wallet_id: result.wallet_id,
        amount,
        currency,
        status: "succeeded",
      });
    }

    return jr(404, { error: "Payment not found yet — wait for webhook or try again" });
  } catch (err) {
    console.error("dodo-verify-payment", err);
    return jr(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
