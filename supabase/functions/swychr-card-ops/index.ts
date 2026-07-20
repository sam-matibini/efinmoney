import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import {
  freezeSwychrCard,
  getSwychrCardTransactions,
  rechargeSwychrCard,
  unfreezeSwychrCard,
} from "../_shared/swychr-card.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!isSwychrEnabled() || !isSwychrConfigured("card")) {
    return new Response(JSON.stringify({ error: "Swychr cards disabled" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const body = await req.json().catch(() => ({}));
  const { action, card_id, amount } = body as Record<string, unknown>;
  if (!action || !card_id) {
    return new Response(JSON.stringify({ error: "action and card_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: owned } = await userClient.from("swychr_cards")
    .select("id, status").eq("swychr_card_id", String(card_id)).eq("user_id", user.id).maybeSingle();
  if (!owned) {
    return new Response(JSON.stringify({ error: "Card not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let result;
  switch (String(action)) {
    case "recharge":
      result = await rechargeSwychrCard({ card_id: String(card_id), amount: Number(amount) });
      break;
    case "freeze":
      result = await freezeSwychrCard({ card_id: String(card_id) });
      break;
    case "unfreeze":
      result = await unfreezeSwychrCard({ card_id: String(card_id) });
      break;
    case "transactions":
      result = await getSwychrCardTransactions({ card_id: String(card_id) });
      break;
    default:
      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
  }

  if (result.ok && (action === "freeze" || action === "unfreeze")) {
    await admin.from("swychr_cards").update({
      status: action === "freeze" ? "frozen" : "active",
      updated_at: new Date().toISOString(),
    }).eq("id", owned.id);
  }

  return new Response(JSON.stringify({
    success: result.ok,
    data: result.data,
    message: result.message,
  }), {
    status: result.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
