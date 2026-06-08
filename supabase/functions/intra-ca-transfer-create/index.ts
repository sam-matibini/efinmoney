import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { plaid_account_id, destination_wallet_id, amount_cad, description } = await req.json();
    if (!plaid_account_id || !destination_wallet_id || !amount_cad) {
      return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (Number(amount_cad) <= 0 || Number(amount_cad) > 25000) {
      return new Response(JSON.stringify({ error: "Amount must be between 0.01 and 25,000 CAD" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate ownership
    const { data: pa } = await supabase.from("plaid_accounts").select("*").eq("id", plaid_account_id).eq("user_id", user.id).maybeSingle();
    if (!pa) return new Response(JSON.stringify({ error: "Bank account not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: wallet } = await supabase.from("wallets").select("*").eq("id", destination_wallet_id).eq("user_id", user.id).maybeSingle();
    if (!wallet || wallet.currency_code !== "CAD") {
      return new Response(JSON.stringify({ error: "Destination must be a CAD wallet you own" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create transfer record
    const { data: transfer, error: tErr } = await supabase.from("intra_ca_transfers").insert({
      user_id: user.id,
      plaid_account_id,
      destination_wallet_id,
      amount_cad,
      description: description || "Bank top-up via Plaid + PAD",
      status: "processing",
    }).select().single();
    if (tErr) throw tErr;

    // Create Stripe PaymentIntent (acss_debit / PAD in CAD)
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    let pi: any = null;
    let stripeError: string | null = null;
    if (stripeKey && pa.institution_number && pa.branch_number && pa.account_number) {
      const params = new URLSearchParams();
      params.append("amount", String(Math.round(Number(amount_cad) * 100)));
      params.append("currency", "cad");
      params.append("payment_method_types[]", "acss_debit");
      params.append("payment_method_data[type]", "acss_debit");
      params.append("payment_method_data[acss_debit][institution_number]", pa.institution_number);
      params.append("payment_method_data[acss_debit][transit_number]", pa.branch_number);
      params.append("payment_method_data[acss_debit][account_number]", pa.account_number);
      params.append("payment_method_data[billing_details][name]", user.user_metadata?.full_name || user.email || "eFinMoney user");
      params.append("payment_method_data[billing_details][email]", user.email || "");
      params.append("payment_method_options[acss_debit][mandate_options][payment_schedule]", "sporadic");
      params.append("payment_method_options[acss_debit][mandate_options][transaction_type]", "personal");
      // Mandate acceptance (required for ACSS Debit / PAD)
      params.append("mandate_data[customer_acceptance][type]", "online");
      params.append("mandate_data[customer_acceptance][online][ip_address]", req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0");
      params.append("mandate_data[customer_acceptance][online][user_agent]", req.headers.get("user-agent") || "eFinMoney");
      params.append("confirm", "true");
      params.append("description", `eFinMoney intra-CA transfer ${transfer.reference}`);
      params.append("metadata[transfer_id]", transfer.id);
      params.append("metadata[reference]", transfer.reference);

      const r = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      pi = await r.json();
      if (!r.ok) {
        stripeError = pi?.error?.message || "Stripe error";
        console.error("Stripe PI error", pi);
      }
    } else {
      stripeError = "Stripe key not configured or Plaid account missing EFT numbers (sandbox bank may not support /auth)";
    }

    if (stripeError) {
      const stripeCode: string | undefined = pi?.error?.code;
      await supabase.from("intra_ca_transfers").update({
        status: "failed",
        failure_reason: stripeError,
        stripe_payment_intent_id: pi?.id ?? null,
        stripe_status: pi?.status ?? null,
      }).eq("id", transfer.id);

      let friendly = stripeError;
      let error_code = "stripe_error";
      if (stripeCode === "payment_method_bank_account_blocked" || /failed verification in the past/i.test(stripeError)) {
        friendly = "This bank account is permanently blocked by Stripe and cannot be used for PAD. Please link a different Canadian bank.";
        error_code = "bank_account_blocked";
      } else if (/EFT numbers/i.test(stripeError)) {
        error_code = "missing_eft";
      }

      // Return 200 so the client toast surfaces a readable message instead of
      // a generic "non-2xx" error, and the page does not blank-screen.
      return new Response(JSON.stringify({
        success: false,
        fallback: true,
        error: friendly,
        error_code,
        stripe_error: stripeError,
        plaid_account_id,
        transfer,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }


    // Post ledger entries (debit cash-in-transit, credit customer wallet liability)
    const { data: liabAcc } = await supabase.from("ledger_accounts").select("id").like("code", "21%").eq("currency_code", "CAD").limit(1).single();
    const { data: cashAcc } = await supabase.from("ledger_accounts").select("id").like("code", "11%").eq("currency_code", "CAD").limit(1).maybeSingle();

    if (liabAcc && cashAcc) {
      const journalId = crypto.randomUUID();
      await supabase.from("ledger_entries").insert([
        {
          journal_id: journalId, account_id: cashAcc.id, wallet_id: null, currency_code: "CAD",
          debit_amount: amount_cad, credit_amount: 0,
          description: `Plaid+PAD top-up ${transfer.reference} (in transit)`,
          reference_type: "intra_ca_transfer", reference_id: transfer.id, created_by: user.id,
        },
        {
          journal_id: journalId, account_id: liabAcc.id, wallet_id: destination_wallet_id, currency_code: "CAD",
          debit_amount: 0, credit_amount: amount_cad,
          description: `Wallet credit from bank ${pa.name} (••${pa.mask})`,
          reference_type: "intra_ca_transfer", reference_id: transfer.id, created_by: user.id,
        },
      ]);
    }

    await supabase.from("intra_ca_transfers").update({
      status: pi?.status === "succeeded" ? "completed" : "processing",
      stripe_payment_intent_id: pi?.id,
      stripe_status: pi?.status,
    }).eq("id", transfer.id);

    return new Response(JSON.stringify({
      success: true,
      transfer_id: transfer.id,
      reference: transfer.reference,
      stripe_status: pi?.status,
      hosted_mandate_url: pi?.next_action?.verify_with_microdeposits?.hosted_verification_url || null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
