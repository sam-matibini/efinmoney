import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { elicatePaymentStreamResponse } from "../_shared/elicate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let chargeId: string | null = null;
    let transactionId: string | null = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      chargeId = typeof body.charge_id === "string" ? body.charge_id : null;
      transactionId = typeof body.transaction_id === "string" ? body.transaction_id : null;
    } else {
      const url = new URL(req.url);
      chargeId = url.searchParams.get("charge_id");
      transactionId = url.searchParams.get("transaction_id");
    }

    if (!chargeId && !transactionId) {
      return new Response(JSON.stringify({ error: "charge_id or transaction_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = admin.from("elicate_charges").select("id,psp_reference,user_id").eq("user_id", user.id);
    if (chargeId) query = query.eq("id", chargeId);
    else query = query.eq("psp_reference", transactionId!);
    const { data: charge } = await query.maybeSingle();
    if (!charge) {
      return new Response(JSON.stringify({ error: "Charge not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const providerId = String(charge.psp_reference || transactionId || "");
    if (!providerId) {
      return new Response(JSON.stringify({ error: "No provider transaction id yet" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = await elicatePaymentStreamResponse(providerId);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("Content-Type") || "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
