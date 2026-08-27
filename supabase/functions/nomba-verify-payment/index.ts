/**
 * Verify / reconcile a Nomba Checkout payment and credit the wallet if paid.
 * POST { transaction_id? } or { reference? } or { order_id? }
 * Auth: user JWT (own txn) or service role.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchNombaCheckoutTransaction, nombaApiConfigured } from "../_shared/nomba-api.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!nombaApiConfigured()) return json({ error: "Nomba API not configured" }, 503);

    const authHeader = req.headers.get("Authorization") || "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const isService = authHeader.includes(serviceKey) || req.headers.get("x-internal-secret") === (Deno.env.get("INTERNAL_FUNCTION_SECRET") || serviceKey);

    const body = await req.json().catch(() => ({})) as {
      transaction_id?: string;
      reference?: string;
      order_id?: string;
    };

    let q = admin.from("nomba_pay_transactions").select("*");
    if (body.transaction_id) q = q.eq("id", body.transaction_id);
    else if (body.reference) q = q.eq("reference", body.reference);
    else if (body.order_id) q = q.eq("order_id", body.order_id);
    else return json({ error: "transaction_id, reference, or order_id required" }, 400);

    const { data: txn, error } = await q.maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!txn) return json({ error: "Transaction not found" }, 404);
    if (!isService && (!user || txn.user_id !== user.id)) {
      return json({ error: "Forbidden" }, 403);
    }
    if (txn.status === "completed") {
      return json({ verified: true, already_completed: true, transaction_id: txn.id });
    }

    const lookupId = String(txn.reference || txn.order_id || "").trim();
    const idType = String(txn.reference || "").startsWith("efin-nomba")
      ? "ORDER_REFERENCE" as const
      : "ORDER_ID" as const;
    const fetched = await fetchNombaCheckoutTransaction({
      id: lookupId,
      idType: String(txn.reference || "").startsWith("efin-nomba") ? "ORDER_REFERENCE" : idType,
    });

    if (!fetched.paid) {
      // Try alternate id
      const alt = lookupId === txn.reference ? txn.order_id : txn.reference;
      const fetched2 = alt
        ? await fetchNombaCheckoutTransaction({
          id: String(alt),
          idType: String(alt).startsWith("efin-nomba") ? "ORDER_REFERENCE" : "ORDER_ID",
        })
        : null;
      if (!fetched2?.paid) {
        return json({
          verified: false,
          status: "unpaid_or_unknown",
          nomba: fetched.json,
          alt: fetched2?.json ?? null,
        });
      }
    }

    // Credit via shared callback logic by POSTing a synthetic webhook
    const cbUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/nomba-payment-callback`;
    const synthetic = {
      event_type: "payment_success",
      data: {
        order: {
          orderReference: txn.reference,
          orderId: txn.order_id,
          amount: txn.checkout_amount ?? txn.amount,
          currency: txn.checkout_currency ?? txn.currency,
        },
        status: "success",
        message: "reconciled via nomba-verify-payment",
      },
    };
    const creditRes = await fetch(cbUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
      },
      body: JSON.stringify(synthetic),
    });
    const creditJson = await creditRes.json().catch(() => ({}));
    return json({
      verified: true,
      credited: creditRes.ok,
      credit: creditJson,
      transaction_id: txn.id,
    });
  } catch (err) {
    console.error("nomba-verify-payment", err);
    return json({ error: err instanceof Error ? err.message : "verify failed" }, 500);
  }
});
