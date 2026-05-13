import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@17.3.1?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-11-20.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const paymentMethodId = String(body?.payment_method_id ?? "");
    const amount = Number(body?.amount);
    const currency = String(body?.currency ?? "").toUpperCase();
    const walletId = body?.wallet_id ? String(body.wallet_id) : null;
    const transferId = body?.transfer_id ? String(body.transfer_id) : null;
    const purpose = String(body?.purpose ?? "wallet_topup");

    if (!paymentMethodId.startsWith("pm_")) return json({ error: "Invalid payment_method_id" }, 400);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999.99) {
      return json({ error: "Invalid amount" }, 400);
    }
    if (!/^[A-Z]{3}$/.test(currency)) return json({ error: "Invalid currency" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify saved card belongs to caller
    const { data: card } = await admin
      .from("saved_payment_methods")
      .select("id, user_id, stripe_customer_id, stripe_payment_method_id")
      .eq("stripe_payment_method_id", paymentMethodId)
      .maybeSingle();
    if (!card || card.user_id !== userId) return json({ error: "Card not found" }, 404);

    // Resolve target wallet (default for currency if not provided)
    let resolvedWalletId = walletId;
    if (!resolvedWalletId) {
      const { data: w } = await admin
        .from("wallets")
        .select("id")
        .eq("user_id", userId)
        .eq("currency_code", currency)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      resolvedWalletId = w?.id ?? null;
    } else {
      const { data: w } = await admin
        .from("wallets")
        .select("id, user_id")
        .eq("id", resolvedWalletId)
        .maybeSingle();
      if (!w || w.user_id !== userId) return json({ error: "Wallet not found" }, 404);
    }
    if (!resolvedWalletId) return json({ error: `No ${currency} wallet found` }, 400);

    // Charge via Stripe
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency.toLowerCase(),
        customer: card.stripe_customer_id,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { user_id: userId, wallet_id: resolvedWalletId, transfer_id: transferId ?? "", purpose },
      });
    } catch (err: any) {
      const code = err?.code ?? err?.raw?.code ?? "stripe_error";
      const message = err?.message ?? "Card charge failed";
      // Return 200 with error payload so supabase-js doesn't surface a FunctionsHttpError
      // (which the client treats as a runtime error / blank screen).
      return json({ success: false, error: message, code, declined: true });
    }

    if (intent.status !== "succeeded") {
      return json({ success: false, error: `Payment ${intent.status}`, status: intent.status, payment_intent_id: intent.id });
    }

    // Idempotency: skip ledger if already posted for this PI
    const { data: existing } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("reference_type", "stripe_card_charge")
      .ilike("description", `%${intent.id}%`)
      .limit(1);
    if (existing && existing.length > 0) {
      return json({ success: true, alreadyProcessed: true, payment_intent_id: intent.id });
    }

    // Post ledger
    const { data: bankAcc } = await admin
      .from("ledger_accounts")
      .select("id")
      .like("code", "11%")
      .eq("currency_code", currency)
      .limit(1)
      .maybeSingle();
    const { data: liabAcc } = await admin
      .from("ledger_accounts")
      .select("id")
      .like("code", "21%")
      .eq("currency_code", currency)
      .limit(1)
      .maybeSingle();
    if (!bankAcc || !liabAcc) {
      return json({ success: true, payment_intent_id: intent.id, ledger_warning: `Missing ledger accounts for ${currency}` });
    }

    const journalId = crypto.randomUUID();
    const refId = crypto.randomUUID();
    const desc = `Stripe card charge (${intent.id}) — ${purpose}`;
    const entries = [
      {
        journal_id: journalId,
        account_id: bankAcc.id,
        wallet_id: null,
        currency_code: currency,
        debit_amount: amount,
        credit_amount: 0,
        description: desc,
        reference_type: "stripe_card_charge",
        reference_id: refId,
        created_by: userId,
      },
      {
        journal_id: journalId,
        account_id: liabAcc.id,
        wallet_id: resolvedWalletId,
        currency_code: currency,
        debit_amount: 0,
        credit_amount: amount,
        description: desc,
        reference_type: "stripe_card_charge",
        reference_id: refId,
        created_by: userId,
      },
    ];
    const { error: ledgerErr } = await admin.from("ledger_entries").insert(entries);
    if (ledgerErr) return json({ error: ledgerErr.message, payment_intent_id: intent.id }, 500);

    return json({
      success: true,
      payment_intent_id: intent.id,
      ledger_journal_id: journalId,
      wallet_id: resolvedWalletId,
      amount,
      currency,
    });
  } catch (e) {
    console.error("stripe-charge-saved-card error:", e);
    return json({ error: (e as Error).message ?? "Unknown error" }, 500);
  }
});
