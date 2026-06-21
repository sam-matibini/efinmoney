import {
  corsHeaders,
  json,
  admin,
  requireStaffOrCron,
  fetchStripeBalances,
  fetchFlutterwaveBalances,
  upsertProviderBalances,
} from "../_shared/treasury-worker.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const gate = await requireStaffOrCron(req);
    if ("error" in gate) return gate.error;

    const db = admin();
    const [stripeRows, flwRows] = await Promise.all([
      fetchStripeBalances(),
      fetchFlutterwaveBalances(),
    ]);
    const all = [...stripeRows, ...flwRows];
    await upsertProviderBalances(db, all);

    const { data: cached } = await db
      .from("treasury_provider_balances")
      .select("*")
      .order("provider")
      .order("currency");

    return json({
      ok: true,
      synced: all.length,
      balances: cached ?? [],
      live: all,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
