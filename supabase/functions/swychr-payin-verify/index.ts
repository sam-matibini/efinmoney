import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import { getSwychrPaymentLinkStatus } from "../_shared/swychr-payin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isSwychrEnabled() || !isSwychrConfigured("payin")) {
    return new Response(JSON.stringify({ error: "Swychr disabled" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const transactionId = String((body as Record<string, unknown>).transaction_id ?? "");
  if (!transactionId) {
    return new Response(JSON.stringify({ error: "transaction_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: txn } = await supabase.from("swychr_payin_transactions")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();
  if (!txn) {
    return new Response(JSON.stringify({ error: "Transaction not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const remote = await getSwychrPaymentLinkStatus(transactionId);
  await admin.from("swychr_payin_transactions").update({
    status: remote.status === "completed" ? "completed" : remote.status,
    last_event: remote.raw,
  }).eq("id", txn.id);

  if (remote.status === "completed" && txn.status !== "completed") {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/swychr-payin-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify(remote.raw),
    });
  }

  return new Response(JSON.stringify({
    verified: true,
    status: remote.status,
    transaction_id: transactionId,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
