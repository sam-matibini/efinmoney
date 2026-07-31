// Fetch a Circle CPN quote for a given corridor + amount.
// Returns rate, fees, ETA, and our final markup applied.
import { createClient } from "npm:@supabase/supabase-js@2";
import { quotePrice } from "../_shared/pricingService.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { circleFetch, CIRCLE_ORIGINATOR_ID } from "../_shared/circle.ts";
import { z } from "npm:zod@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const Body = z.object({
  source_currency: z.string().min(3).max(10),
  dest_country: z.string().length(2),
  dest_currency: z.string().min(3).max(10),
  source_amount: z.number().positive().max(1_000_000),
  payout_method: z.enum(["bank", "wallet"]).default("bank"),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE);

  // Rate limit
  const { data: rl } = await admin.rpc("check_rate_limit", {
    p_key: `circle_quote:${user.id}`, p_max_requests: 30, p_window_seconds: 60,
  });
  if (rl === false) return json({ error: "Rate limit exceeded" }, 429);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
  const p = parsed.data;

  // Verify the corridor is enabled
  const { data: corridor } = await admin
    .from("cpn_corridors")
    .select("*")
    .eq("source_currency", p.source_currency)
    .eq("dest_country", p.dest_country)
    .eq("dest_currency", p.dest_currency)
    .eq("payout_method", p.payout_method)
    .maybeSingle();

  if (!corridor || !corridor.enabled) {
    return json({ error: "Corridor not enabled" }, 400);
  }
  if (p.source_amount < Number(corridor.min_amount) || p.source_amount > Number(corridor.max_amount)) {
    return json({
      error: `Amount must be between ${corridor.min_amount} and ${corridor.max_amount} ${p.source_currency}`,
    }, 400);
  }

  // Call Circle CPN quote endpoint
  const quoteRes = await circleFetch<any>({
    method: "POST",
    path: "/v1/cpn/quotes",
    body: {
      originatorId: CIRCLE_ORIGINATOR_ID,
      sourceCurrency: p.source_currency,
      sourceAmount: p.source_amount.toFixed(2),
      destinationCountry: p.dest_country,
      destinationCurrency: p.dest_currency,
      payoutMethod: p.payout_method,
    },
  });

  if (!quoteRes.ok) {
    return json({ error: quoteRes.error ?? "Quote failed", details: quoteRes.data }, 502);
  }

  const q = quoteRes.data ?? {};
  const circleRate = Number(q.exchangeRate ?? q.rate ?? 0);
  const circleFee = Number(q.fee ?? q.totalFees ?? 0);
  const destAmountRaw = Number(q.destinationAmount ?? q.targetAmount ?? 0);

  // Our margin comes from the central rate card. `cpn_corridors.markup_bps`
  // is a deprecated fallback kept only for corridors not yet on the rate card.
  const cardQuote = await quotePrice(admin, {
    direction: "payout",
    sourceCurrency: p.source_currency,
    destCurrency: p.dest_currency,
    destCountry: p.dest_country,
    paymentMethod: `cpn_${p.payout_method}`,
    customerType: "consumer",
    amount: p.source_amount,
  });

  const markupRate = cardQuote.pricingMissing
    ? Number(corridor.markup_bps ?? 0) / 10_000
    : cardQuote.fxMarginBps / 10_000;
  const effectiveRate = circleRate * (1 - markupRate);
  const platformFee = cardQuote.pricingMissing
    ? Number((p.source_amount * markupRate).toFixed(2))
    : Number((cardQuote.fee + cardQuote.fxRevenue).toFixed(2));
  const destAmount = destAmountRaw > 0
    ? Number((destAmountRaw * (1 - markupRate)).toFixed(2))
    : Number(((p.source_amount - circleFee) * effectiveRate).toFixed(2));

  return json({
    quote_id: q.id ?? q.quoteId ?? null,
    source_currency: p.source_currency,
    source_amount: p.source_amount,
    dest_currency: p.dest_currency,
    dest_country: p.dest_country,
    dest_amount: destAmount,
    circle_rate: circleRate,
    effective_rate: effectiveRate,
    circle_fee: circleFee,
    platform_fee: platformFee,
    total_fee: Number((circleFee + platformFee).toFixed(2)),
    pricing_source: cardQuote.pricingMissing ? "corridor_fallback" : "rate_card",
    est_minutes: corridor.est_minutes,
    expires_at: q.expiresAt ?? null,
    raw: q,
  });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
