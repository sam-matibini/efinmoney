import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isSwychrConfigured, isSwychrEnabled } from "../_shared/swychr-auth.ts";
import { issueSwychrLiteCard } from "../_shared/swychr-card.ts";

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
  const { swychr_user_id, amount, card_type, wallet_id } = body as Record<string, unknown>;
  if (!swychr_user_id || !amount) {
    return new Response(JSON.stringify({ error: "swychr_user_id and amount required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await issueSwychrLiteCard({
    user_id: String(swychr_user_id),
    amount: Number(amount),
    card_type: (card_type === "VISA" ? "VISA" : "MASTERCARD"),
  });

  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.message, raw: result.data }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const cardList = (result.data as Record<string, unknown>).card_list as Record<string, unknown> | undefined;
  const swychrCardId = String(cardList?.id ?? cardList?.card_id ?? crypto.randomUUID());

  await admin.from("swychr_cards").insert({
    user_id: user.id,
    swychr_card_id: swychrCardId,
    card_type: String(card_type ?? "MASTERCARD"),
    last_four: String(cardList?.last_four ?? "0000").slice(-4),
    wallet_id: typeof wallet_id === "string" ? wallet_id : null,
    raw_response: result.data,
  });

  return new Response(JSON.stringify({ success: true, card: cardList, message: result.message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
