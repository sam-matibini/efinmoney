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
    const destination_payment_method = String(body?.destination_payment_method ?? "");
    const amount = Number(body?.amount);
    const network = body?.network === "us_domestic_wire" ? "us_domestic_wire" : "ach";
    const description = String(body?.description ?? "Outbound transfer");

    if (!fa_id || !destination_payment_method || !Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Invalid input" }, 400);
    }

    const { data: fa } = await db.from("treasury_financial_accounts").select("*").eq("id", fa_id).maybeSingle();
    if (!fa) return json({ error: "FA not found" }, 404);
    const staff = await isStaff(db, user.id);
    if (fa.user_id !== user.id && !staff) return json({ error: "Forbidden" }, 403);

    const ot = await stripe.treasury.outboundTransfers.create(
      {
        financial_account: fa.stripe_fa_id,
        amount: Math.round(amount * 100),
        currency: "usd",
        destination_payment_method,
        description,
        destination_payment_method_options: { us_bank_account: { network } },
      },
      fa.connected_account_id ? { stripeAccount: fa.connected_account_id } : undefined,
    );

    const { data: row, error } = await db
      .from("treasury_transfers")
      .insert({
        fa_id: fa.id,
        user_id: fa.user_id,
        kind: "outbound_transfer",
        stripe_id: ot.id,
        direction: "debit",
        amount,
        currency: "USD",
        network,
        status: ot.status,
        description,
        metadata: { destination_payment_method },
      })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ transfer: row });
  } catch (e: any) {
    console.error("treasury-outbound", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
