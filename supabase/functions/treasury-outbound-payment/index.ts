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
    const amount = Number(body?.amount);
    const network = body?.network === "us_domestic_wire" ? "us_domestic_wire" : "ach";
    const description = String(body?.description ?? "Outbound payment");
    const payee_name = String(body?.payee_name ?? "");
    const routing_number = String(body?.routing_number ?? "");
    const account_number = String(body?.account_number ?? "");
    const account_holder_type = body?.account_holder_type === "company" ? "company" : "individual";

    if (!fa_id || !Number.isFinite(amount) || amount <= 0 || !payee_name || !routing_number || !account_number) {
      return json({ error: "Invalid input" }, 400);
    }

    const { data: fa } = await db.from("treasury_financial_accounts").select("*").eq("id", fa_id).maybeSingle();
    if (!fa) return json({ error: "FA not found" }, 404);
    const staff = await isStaff(db, user.id);
    if (fa.user_id !== user.id && !staff) return json({ error: "Forbidden" }, 403);

    const op = await stripe.treasury.outboundPayments.create(
      {
        financial_account: fa.stripe_fa_id,
        amount: Math.round(amount * 100),
        currency: "usd",
        description,
        destination_payment_method_data: {
          type: "us_bank_account",
          us_bank_account: {
            account_holder_type,
            routing_number,
            account_number,
          },
          billing_details: { name: payee_name },
        },
        destination_payment_method_options: { us_bank_account: { network } },
      },
      fa.connected_account_id ? { stripeAccount: fa.connected_account_id } : undefined,
    );

    const { data: row, error } = await db
      .from("treasury_transfers")
      .insert({
        fa_id: fa.id,
        user_id: fa.user_id,
        kind: "outbound_payment",
        stripe_id: op.id,
        direction: "debit",
        amount,
        currency: "USD",
        network,
        status: op.status,
        description,
        counterparty: { payee_name, routing_number, account_number_last4: account_number.slice(-4) },
      })
      .select("*")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({ transfer: row });
  } catch (e: any) {
    console.error("treasury-outbound-payment", e);
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
