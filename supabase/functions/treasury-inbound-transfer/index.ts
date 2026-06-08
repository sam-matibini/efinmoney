import { corsHeaders, json, requireUser, admin, isStaff, stripe } from "../_shared/treasury.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireUser(req);
    if ("error" in auth) return auth.error;
    const { user } = auth;
    const db = admin();

    const body = await req.json().catch(() => ({}));
    const fa_id = String(body?.fa_id ?? "");
    const origin_payment_method = String(body?.origin_payment_method ?? ""); // Stripe payment method id (us_bank_account)
    const amount = Number(body?.amount);
    const description = String(body?.description ?? "Inbound transfer");

    if (!fa_id || !origin_payment_method || !Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Invalid input" }, 400);
    }

    const { data: fa } = await db.from("treasury_financial_accounts").select("*").eq("id", fa_id).maybeSingle();
    if (!fa) return json({ error: "FA not found" }, 404);
    const staff = await isStaff(db, user.id);
    if (fa.user_id !== user.id && !staff) return json({ error: "Forbidden" }, 403);

    const it = await stripe.treasury.inboundTransfers.create(
      {
        financial_account: fa.stripe_fa_id,
        amount: Math.round(amount * 100),
        currency: "usd",
        origin_payment_method,
        description,
      },
      fa.connected_account_id ? { stripeAccount: fa.connected_account_id } : undefined,
    );

    const { data: row, error } = await db
      .from("treasury_transfers")
      .insert({
        fa_id: fa.id,
        user_id: fa.user_id,
        kind: "inbound_transfer",
        stripe_id: it.id,
        direction: "credit",
        amount,
        currency: "USD",
        network: "ach",
        status: it.status,
        description,
        metadata: { origin_payment_method },
      })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ transfer: row });
  } catch (e: any) {
    console.error("treasury-inbound", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
